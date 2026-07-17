import { Injectable, Logger } from '@nestjs/common';
import { OrderSide } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { IndicatorsService } from '../indicators/indicators.service';
import { StrategyPnlReporter } from '../bot/strategy-pnl-reporter';
import { PnlTracker } from '../bot/pnl-tracker';
import { TradingStrategy } from './trading-strategy.interface';

export interface BollingerRsiConfig {
  interval: string;         // ej "1m"
  bbPeriod?: number;        // 20
  bbK?: number;             // 2
  rsiPeriod?: number;       // 14
  rsiOversold?: number;     // 30
  rsiOverbought?: number;   // 70
  trendFast?: number;       // 20
  trendSlow?: number;       // 50
  useTrendFilter?: boolean; // true: solo entra en tendencia coherente
  tradeQuantity: number;
  profitMargin: number;     // fraccion, ej 0.003 = 0.3%
  stopLossMargin?: number;  // fraccion
  loopSleepMs?: number;
}

interface OpenPosition {
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  openedAt: Date;
  externalOrderId?: string;
}

@Injectable()
export class BollingerRsiStrategy implements TradingStrategy<BollingerRsiConfig> {
  id: string;
  symbol: string;
  config: BollingerRsiConfig;

  private readonly logger = new Logger(BollingerRsiStrategy.name);
  private isRunning = true;
  private position: OpenPosition | null = null;
  private tickSize = 0.00000001;
  private pnl = new PnlTracker();
  private legCounter = 0;

  constructor(
    private readonly binanceService: BinanceService,
    private readonly indicators: IndicatorsService,
  ) {}

  attachPnlReporter(reporter: StrategyPnlReporter): void {
    this.pnl.attach(reporter);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  async run(): Promise<void> {
    this.logger.log(`Starting BollingerRSI on ${this.symbol}`);

    try {
      this.tickSize = await this.binanceService.getSymbolTickSize(this.symbol);
    } catch (err) {
      this.logger.warn(`No tick size for ${this.symbol}, using default`);
    }

    const interval = this.config.interval || '1m';
    const bbPeriod = this.config.bbPeriod ?? 20;
    const bbK = this.config.bbK ?? 2;
    const rsiPeriod = this.config.rsiPeriod ?? 14;
    const oversold = this.config.rsiOversold ?? 30;
    const overbought = this.config.rsiOverbought ?? 70;
    const useTrend = this.config.useTrendFilter ?? true;
    const trendFast = this.config.trendFast ?? 20;
    const trendSlow = this.config.trendSlow ?? 50;
    const sleepMs = this.config.loopSleepMs ?? 10_000;

    while (this.isRunning) {
      try {
        const [bb, rsi, trend, priceResp] = await Promise.all([
          this.indicators.getBollinger(this.symbol, interval, bbPeriod, bbK),
          this.indicators.getRSI(this.symbol, interval, rsiPeriod),
          this.indicators.getTrend(this.symbol, interval, trendFast, trendSlow),
          this.binanceService.getSymbolPrice(this.symbol),
        ]);

        const price = parseFloat(priceResp.price);

        if (!bb || rsi === null) {
          this.logger.warn(`Indicators not ready for ${this.symbol}. Sleeping.`);
          await this.sleep(sleepMs);
          continue;
        }

        const trendDir = trend?.direction ?? 'SIDEWAYS';
        this.logger.log(
          `${this.symbol} price=${price} rsi=${rsi.toFixed(2)} %B=${bb.percentB.toFixed(2)} bw=${bb.bandwidth.toFixed(4)} trend=${trendDir}`,
        );

        if (!this.position) {
          const bullSignal = rsi <= oversold && bb.percentB <= 0.1;
          const bearSignal = rsi >= overbought && bb.percentB >= 0.9;
          const trendAllowsBull = !useTrend || trendDir !== 'DOWN';
          const trendAllowsBear = !useTrend || trendDir !== 'UP';

          if (bullSignal && trendAllowsBull) {
            await this.openLong(price);
          } else if (bearSignal && trendAllowsBear) {
            await this.openShort(price);
          }
        } else {
          await this.checkExit(price, bb, rsi);
        }

        await this.pnl.snapshot(this.position ? 1 : 0, price, {
          rsi,
          percentB: bb.percentB,
          bandwidth: bb.bandwidth,
          trend: trendDir,
          trendStrength: trend?.strength ?? 0,
        });

        await this.sleep(sleepMs);
      } catch (err) {
        this.logger.error(`Loop err ${this.symbol}`, err as Error);
        await this.sleep(30_000);
      }
    }
  }

  private async openLong(price: number) {
    const qty = this.config.tradeQuantity.toString();
    try {
      const order = await this.binanceService.createLimitOrder(
        this.symbol,
        'BUY',
        qty,
        this.adjust(price).toString(),
        'GTC',
      );
      this.position = {
        side: OrderSide.BUY,
        entryPrice: price,
        quantity: this.config.tradeQuantity,
        openedAt: new Date(),
        externalOrderId: String(order.orderId),
      };
      this.pnl.openLeg(++this.legCounter, price, this.config.tradeQuantity, OrderSide.BUY);
      this.logger.log(`OPEN LONG ${this.symbol} @ ${price}`);
    } catch (err) {
      this.logger.error('openLong err', err as Error);
    }
  }

  private async openShort(price: number) {
    const qty = this.config.tradeQuantity.toString();
    try {
      const order = await this.binanceService.createLimitOrder(
        this.symbol,
        'SELL',
        qty,
        this.adjust(price).toString(),
        'GTC',
      );
      this.position = {
        side: OrderSide.SELL,
        entryPrice: price,
        quantity: this.config.tradeQuantity,
        openedAt: new Date(),
        externalOrderId: String(order.orderId),
      };
      this.pnl.openLeg(++this.legCounter, price, this.config.tradeQuantity, OrderSide.SELL);
      this.logger.log(`OPEN SHORT ${this.symbol} @ ${price}`);
    } catch (err) {
      this.logger.error('openShort err', err as Error);
    }
  }

  private async checkExit(
    price: number,
    bb: { middle: number; upper: number; lower: number },
    rsi: number,
  ) {
    if (!this.position) return;
    const pos = this.position;
    const isLong = pos.side === OrderSide.BUY;
    const profitTarget = isLong
      ? pos.entryPrice * (1 + this.config.profitMargin)
      : pos.entryPrice * (1 - this.config.profitMargin);
    const stopPrice = this.config.stopLossMargin
      ? isLong
        ? pos.entryPrice * (1 - this.config.stopLossMargin)
        : pos.entryPrice * (1 + this.config.stopLossMargin)
      : null;

    let shouldExit = false;
    let reason = '';

    if (isLong) {
      if (price >= profitTarget) { shouldExit = true; reason = 'takeProfit'; }
      else if (stopPrice && price <= stopPrice) { shouldExit = true; reason = 'stopLoss'; }
      else if (price >= bb.middle && rsi >= 55) { shouldExit = true; reason = 'meanRevert'; }
    } else {
      if (price <= profitTarget) { shouldExit = true; reason = 'takeProfit'; }
      else if (stopPrice && price >= stopPrice) { shouldExit = true; reason = 'stopLoss'; }
      else if (price <= bb.middle && rsi <= 45) { shouldExit = true; reason = 'meanRevert'; }
    }

    if (shouldExit) {
      await this.closePosition(price, reason);
    }
  }

  private async closePosition(price: number, reason: string) {
    if (!this.position) return;
    const pos = this.position;
    const closingSide: 'BUY' | 'SELL' = pos.side === OrderSide.BUY ? 'SELL' : 'BUY';

    try {
      const order = await this.binanceService.createLimitOrder(
        this.symbol,
        closingSide,
        pos.quantity.toString(),
        this.adjust(price).toString(),
        'GTC',
      );
      await this.pnl.closeLeg(this.legCounter, price, order.orderId);
      this.logger.log(`CLOSE ${pos.side} ${this.symbol} @ ${price} (${reason})`);
      this.position = null;
    } catch (err) {
      this.logger.error('closePosition err', err as Error);
    }
  }

  private adjust(price: number): number {
    return Math.floor(price / this.tickSize) * this.tickSize;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
