import { Injectable, Logger } from '@nestjs/common';
import { OrderSide, PrismaClient } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { IndicatorsService } from '../indicators/indicators.service';
import { PnlTracker } from '../bot/pnl-tracker';
import { StrategyPnlReporter } from '../bot/strategy-pnl-reporter';
import { TradingStrategy } from './trading-strategy.interface';

interface OpenOrder {
  orderId: number;
  price: number;
  qty: number;
  side: OrderSide;
  timestamp: number;
}

export interface AdaptiveGridConfig {
  totalQuantity: number;      // total base quantity budget
  gridLevels: number;         // levels below current price (recommend 8-20)
  gridSpacingPct: number;     // spacing between levels (e.g. 0.005 = 0.5%)
  profitMargin: number;       // TP per leg (e.g. 0.006 = 0.6%)
  stopLossPct?: number;       // per-leg SL (e.g. 0.03)

  emaFastPeriod?: number;     // default 20
  emaSlowPeriod?: number;     // default 50
  rsiPeriod?: number;         // default 14
  rsiFloor?: number;          // pause BUYs when RSI < floor (default 30)
  interval?: string;          // indicator interval (default '15m')

  maxDrawdownPct?: number;    // pause new BUYs if unrealized loss > pct of deployed (default 0.05)
  emergencyExitPct?: number;  // market-sell inventory if unrealized loss > pct (default 0.12)

  recenterOnBreak?: boolean;  // shift grid center if price exits by 2x spacing (default true)
  minSleepMs?: number;        // default 8000
  maxSleepMs?: number;        // default 20000
  dryRun?: boolean;
}

@Injectable()
export class AdaptiveGridStrategy implements TradingStrategy<AdaptiveGridConfig> {
  id!: string;
  symbol!: string;
  config!: AdaptiveGridConfig;

  private readonly logger = new Logger(AdaptiveGridStrategy.name);
  private isRunning = true;
  private centerPrice = 0;

  private openBuys = new Map<number, OpenOrder>();   // level -> BUY order
  private openTPs = new Map<number, OpenOrder>();    // level -> LIMIT SELL (take-profit)
  private openSLs = new Map<number, OpenOrder>();    // level -> STOP-LOSS SELL

  private pnl = new PnlTracker();
  private botRunId?: number;
  private prismaCtx?: PrismaClient;
  private circuitTripped = false;

  constructor(
    private readonly binance: BinanceService,
    private readonly indicators: IndicatorsService,
  ) {}

  attachPnlReporter(reporter: StrategyPnlReporter): void {
    this.pnl.attach(reporter);
  }

  setBotRunContext(botRunId: number, prisma: PrismaClient): void {
    this.botRunId = botRunId;
    this.prismaCtx = prisma;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  private log(msg: string) {
    this.logger.log(`[${this.id}/${this.symbol}] ${msg}`);
  }
  private warn(msg: string) {
    this.logger.warn(`[${this.id}/${this.symbol}] ${msg}`);
  }
  private err(msg: string, e?: any) {
    this.logger.error(`[${this.id}/${this.symbol}] ${msg}`, e);
  }

  private roundStep(v: number, step: string | number): number {
    const s = typeof step === 'string' ? parseFloat(step) : step;
    if (!s || s <= 0) return v;
    const decimals = Math.max(0, Math.round(-Math.log10(s)));
    return Number((Math.floor(v / s) * s).toFixed(decimals));
  }

  private levelPrice(level: number): number {
    return this.centerPrice * (1 - level * this.config.gridSpacingPct);
  }

  async run(): Promise<void> {
    const cfg = this.config;
    const emaFast = cfg.emaFastPeriod ?? 20;
    const emaSlow = cfg.emaSlowPeriod ?? 50;
    const rsiPeriod = cfg.rsiPeriod ?? 14;
    const rsiFloor = cfg.rsiFloor ?? 30;
    const interval = cfg.interval ?? '15m';
    const maxDDPct = cfg.maxDrawdownPct ?? 0.05;
    const emergencyPct = cfg.emergencyExitPct ?? 0.12;
    const stopLossPct = cfg.stopLossPct ?? 0.03;
    const recenter = cfg.recenterOnBreak ?? true;
    const minSleep = cfg.minSleepMs ?? 8000;
    const maxSleep = cfg.maxSleepMs ?? 20000;
    const qtyPerLevel = cfg.totalQuantity / cfg.gridLevels;

    this.log(
      `START adaptive-grid cfg=${JSON.stringify({ ...cfg, emaFast, emaSlow, rsiPeriod, rsiFloor, interval, maxDDPct, emergencyPct })}`,
    );

    const { priceFilter, lotSizeFilter } = await this.binance.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) throw new Error(`Filters missing ${this.symbol}`);

    const initPrice = parseFloat((await this.binance.getSymbolPrice(this.symbol)).price);
    this.centerPrice = initPrice;
    this.log(`Grid centered at ${initPrice} spacing=${(cfg.gridSpacingPct * 100).toFixed(3)}% levels=${cfg.gridLevels}`);

    while (this.isRunning) {
      try {
        const currentPrice = parseFloat((await this.binance.getSymbolPrice(this.symbol)).price);

        const [ema20, ema50, rsi, atr] = await Promise.all([
          this.indicators.getEMA(this.symbol, interval, emaFast).catch(() => null),
          this.indicators.getEMA(this.symbol, interval, emaSlow).catch(() => null),
          this.indicators.getRSI(this.symbol, interval, rsiPeriod).catch(() => null),
          this.indicators.getATR(this.symbol, interval, 14).catch(() => null),
        ]);

        const trendOk = ema20 !== null && ema50 !== null ? ema20 >= ema50 : true;
        const rsiOk = rsi === null ? true : rsi > rsiFloor;
        const canBuy = trendOk && rsiOk;

        // Circuit breaker
        const unreal = this.pnl.computeUnrealized(currentPrice);
        const deployed = this.computeDeployedNotional();
        const ddPct = deployed > 0 ? Math.abs(Math.min(0, unreal)) / deployed : 0;

        if (ddPct > emergencyPct && !this.circuitTripped) {
          this.warn(`EMERGENCY EXIT triggered ddPct=${(ddPct * 100).toFixed(2)}% > ${(emergencyPct * 100).toFixed(2)}%`);
          await this.emergencyExit(currentPrice, priceFilter, lotSizeFilter);
          this.circuitTripped = true;
        }
        const drawdownBlock = ddPct > maxDDPct;

        // Recenter
        if (recenter && !this.circuitTripped) {
          const lowestLevelPrice = this.levelPrice(cfg.gridLevels);
          const highestLevelPrice = this.levelPrice(0);
          if (currentPrice < lowestLevelPrice * (1 - cfg.gridSpacingPct * 2) ||
              currentPrice > highestLevelPrice * (1 + cfg.gridSpacingPct * 2)) {
            this.warn(`Price ${currentPrice} out of grid [${lowestLevelPrice.toFixed(4)}, ${highestLevelPrice.toFixed(4)}] — recenter`);
            this.centerPrice = currentPrice;
          }
        }

        // Place new BUYs on levels not covered
        if (canBuy && !drawdownBlock && !this.circuitTripped) {
          for (let i = 1; i <= cfg.gridLevels; i++) {
            if (this.openBuys.has(i)) continue;
            if (this.openTPs.has(i)) continue; // already bought & waiting TP
            const rawPrice = this.levelPrice(i);
            if (rawPrice >= currentPrice) continue;
            const price = this.roundStep(rawPrice, priceFilter.tickSize);
            const qty = this.roundStep(qtyPerLevel, lotSizeFilter.stepSize);
            if (qty <= 0) continue;
            try {
              const order = await this.binance.createLimitOrder(this.symbol, 'BUY', qty.toString(), price.toString(), 'GTC');
              this.openBuys.set(i, {
                orderId: Number(order.orderId),
                price,
                qty,
                side: OrderSide.BUY,
                timestamp: Date.now(),
              });
              this.log(`BUY placed level=${i} @ ${price} qty=${qty} (RSI=${rsi?.toFixed(1)} EMA${emaFast}=${ema20?.toFixed(2)} EMA${emaSlow}=${ema50?.toFixed(2)})`);
            } catch (e) {
              this.err(`BUY place fail level=${i}:`, e);
            }
            await new Promise((r) => setTimeout(r, 120));
          }
        } else if (!canBuy) {
          this.log(`SKIP BUYs — trend=${trendOk} rsi=${rsi?.toFixed(1)} (floor=${rsiFloor})`);
        } else if (drawdownBlock) {
          this.warn(`SKIP BUYs — drawdown ${(ddPct * 100).toFixed(2)}% > max ${(maxDDPct * 100).toFixed(2)}%`);
        }

        await this.checkBuys(priceFilter, lotSizeFilter, stopLossPct);
        await this.checkTPs();
        await this.checkSLs();

        await this.pnl.snapshot(this.openBuys.size + this.openTPs.size, currentPrice, {
          canBuy,
          trendOk,
          rsi,
          ema20,
          ema50,
          atr,
          deployedNotional: deployed,
          drawdownPct: ddPct,
          circuitTripped: this.circuitTripped,
          centerPrice: this.centerPrice,
        });

        const sleepMs = minSleep + Math.floor(Math.random() * (maxSleep - minSleep));
        await new Promise((r) => setTimeout(r, sleepMs));
      } catch (e) {
        this.err('Loop error:', e);
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }

  private computeDeployedNotional(): number {
    const inv = this.pnl.getInventory();
    return inv.costBasis;
  }

  private async checkBuys(priceFilter: any, lotSizeFilter: any, stopLossPct: number) {
    for (const [level, ord] of Array.from(this.openBuys.entries())) {
      try {
        const st = await this.binance.checkOrderStatus(this.symbol, ord.orderId);
        if (st.status === 'FILLED') {
          this.openBuys.delete(level);
          this.pnl.openLeg(level, ord.price, ord.qty, OrderSide.BUY, new Date(ord.timestamp));

          const tpPriceRaw = ord.price * (1 + this.config.profitMargin);
          const tpPrice = this.roundStep(tpPriceRaw, priceFilter.tickSize);
          try {
            const tp = await this.binance.createLimitOrder(this.symbol, 'SELL', ord.qty.toString(), tpPrice.toString(), 'GTC');
            this.openTPs.set(level, {
              orderId: Number(tp.orderId),
              price: tpPrice,
              qty: ord.qty,
              side: OrderSide.SELL,
              timestamp: Date.now(),
            });
          } catch (e) {
            this.err(`TP place fail level=${level}:`, e);
          }

          if (stopLossPct > 0) {
            const slPriceRaw = ord.price * (1 - stopLossPct);
            const slPrice = this.roundStep(slPriceRaw, priceFilter.tickSize);
            try {
              const sl = await this.binance.createStopLossOrder(this.symbol, 'SELL', ord.qty.toString(), slPrice.toString());
              this.openSLs.set(level, {
                orderId: Number(sl?.orderId ?? Date.now()),
                price: slPrice,
                qty: ord.qty,
                side: OrderSide.SELL,
                timestamp: Date.now(),
              });
            } catch (e) {
              this.err(`SL place fail level=${level}:`, e);
            }
          }
          this.log(`BUY filled level=${level} → TP@${tpPrice} SL@${(ord.price * (1 - stopLossPct)).toFixed(4)}`);
        } else if (st.status === 'CANCELED' || st.status === 'EXPIRED' || st.status === 'REJECTED') {
          this.openBuys.delete(level);
        }
      } catch (e) {
        this.err(`checkBuys ${ord.orderId}:`, e);
      }
    }
  }

  private async checkTPs() {
    for (const [level, ord] of Array.from(this.openTPs.entries())) {
      try {
        const st = await this.binance.checkOrderStatus(this.symbol, ord.orderId);
        if (st.status === 'FILLED') {
          this.openTPs.delete(level);
          const paired = this.openSLs.get(level);
          if (paired) {
            try { await this.binance.cancelOrder(this.symbol, paired.orderId); } catch {}
            this.openSLs.delete(level);
          }
          await this.pnl.closeLeg(level, ord.price, ord.orderId);
          this.log(`TP filled level=${level} @ ${ord.price}`);
        } else if (['CANCELED', 'EXPIRED', 'REJECTED'].includes(st.status)) {
          this.openTPs.delete(level);
        }
      } catch (e) {
        this.err(`checkTPs ${ord.orderId}:`, e);
      }
    }
  }

  private async checkSLs() {
    for (const [level, ord] of Array.from(this.openSLs.entries())) {
      try {
        const st = await this.binance.checkOrderStatus(this.symbol, ord.orderId);
        if (st.status === 'FILLED') {
          this.openSLs.delete(level);
          const paired = this.openTPs.get(level);
          if (paired) {
            try { await this.binance.cancelOrder(this.symbol, paired.orderId); } catch {}
            this.openTPs.delete(level);
          }
          const fillPrice = parseFloat((st as any).filledPrice ?? (st as any).price ?? ord.price);
          const pnl = await this.pnl.closeLeg(level, fillPrice, ord.orderId);
          this.warn(`SL filled level=${level} @ ${fillPrice} pnl=${pnl?.toFixed(6)}`);
        } else if (['CANCELED', 'EXPIRED', 'REJECTED'].includes(st.status)) {
          this.openSLs.delete(level);
        }
      } catch (e) {
        this.err(`checkSLs ${ord.orderId}:`, e);
      }
    }
  }

  private async emergencyExit(currentPrice: number, priceFilter: any, lotSizeFilter: any) {
    for (const [level, ord] of Array.from(this.openBuys.entries())) {
      try { await this.binance.cancelOrder(this.symbol, ord.orderId); } catch {}
      this.openBuys.delete(level);
    }
    for (const [level, ord] of Array.from(this.openTPs.entries())) {
      try { await this.binance.cancelOrder(this.symbol, ord.orderId); } catch {}
      this.openTPs.delete(level);
    }
    for (const [level, ord] of Array.from(this.openSLs.entries())) {
      try { await this.binance.cancelOrder(this.symbol, ord.orderId); } catch {}
      this.openSLs.delete(level);
    }

    const inv = this.pnl.getInventory();
    if (inv.qty > 0) {
      const qty = this.roundStep(inv.qty, lotSizeFilter.stepSize);
      if (qty > 0) {
        try {
          const mkt = await this.binance.createMarketOrder(this.symbol, 'SELL', qty.toString());
          this.warn(`EMERGENCY market SELL qty=${qty} response=${JSON.stringify(mkt).slice(0, 200)}`);
          const legLevels = Array.from(new Set([...this.openBuys.keys(), ...this.openTPs.keys(), ...this.openSLs.keys()]));
          for (const l of legLevels) {
            await this.pnl.closeLeg(l, currentPrice);
          }
        } catch (e) {
          this.err('EMERGENCY market sell failed:', e);
        }
      }
    }
  }
}
