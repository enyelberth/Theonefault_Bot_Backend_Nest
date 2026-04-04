import { Injectable, Logger } from '@nestjs/common';
import { ADX, ATR, EMA } from 'technicalindicators';
import { BinanceService } from '../../binance/binance.service';
import { EmaAdxTrendStrategyConfig, TradingStrategy } from '../trading-strategy.interface';
import { StrategyRuntimeUtils } from '../shared/strategy-runtime.utils';

@Injectable()
export class EmaAdxTrendStrategy implements TradingStrategy<EmaAdxTrendStrategyConfig> {
  id: string;
  symbol: string;
  config: EmaAdxTrendStrategyConfig;

  private readonly logger = new Logger(EmaAdxTrendStrategy.name);
  private isRunning = true;
  private inPosition = false;
  private entryPrice: number | null = null;
  private stopLossPrice: number | null = null;
  private takeProfitPrice: number | null = null;

  async run(): Promise<void> {
    this.validateConfig();
    this.logger.log(`Starting EMA+ADX trend strategy on ${this.symbol}`);

    const { lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!lotSizeFilter?.stepSize) {
      throw new Error(`Lot size filter not found for ${this.symbol}`);
    }

    while (this.isRunning) {
      try {
        const analysis = await this.getAnalysis();

        if (!analysis) {
          await this.sleep(this.config.minSleepMs ?? 15000);
          continue;
        }

        const {
          currentPrice,
          atr,
          emaFast,
          emaSlow,
          adx,
          plusDI,
          minusDI,
        } = analysis;

        const quantity = this.roundToStep(this.config.tradeQuantity, lotSizeFilter.stepSize);
        if (quantity <= 0) {
          throw new Error('tradeQuantity ajustado por lotSize queda en 0');
        }

        const bullishTrend = emaFast > emaSlow && adx >= this.getAdxThreshold() && plusDI > minusDI;
        const bearishTrend = emaFast < emaSlow && adx >= this.getAdxThreshold() && minusDI > plusDI;

        if (!this.inPosition && bullishTrend) {
          await this.binanceService.createMarketOrder(this.symbol, 'BUY', quantity.toString());
          this.inPosition = true;
          this.entryPrice = currentPrice;
          this.stopLossPrice = currentPrice - atr * this.getStopLossAtrMultiplier();
          this.takeProfitPrice = currentPrice + atr * this.getTakeProfitAtrMultiplier();
          this.logger.log(
            `BUY executed at ${currentPrice}. EMAf=${emaFast.toFixed(6)} EMAs=${emaSlow.toFixed(6)} ADX=${adx.toFixed(2)}`,
          );
        } else if (this.inPosition) {
          const hitStop = this.stopLossPrice !== null && currentPrice <= this.stopLossPrice;
          const hitTakeProfit = this.takeProfitPrice !== null && currentPrice >= this.takeProfitPrice;

          if (hitStop || hitTakeProfit || bearishTrend) {
            await this.binanceService.createMarketOrder(this.symbol, 'SELL', quantity.toString());
            this.logger.log(
              `SELL executed at ${currentPrice}. reason=${hitStop ? 'stop' : hitTakeProfit ? 'take_profit' : 'trend_reversal'}`,
            );
            this.resetPosition();
          }
        }
      } catch (error) {
        this.logger.error('Error in EMA+ADX loop', error instanceof Error ? error.stack : String(error));
        await StrategyRuntimeUtils.exponentialBackoff(
          5000,
          3,
          () => this.isRunning,
          (waitTime) => this.logger.warn(`Retrying in ${waitTime} ms`),
        );
      }

      await this.sleep(this.config.minSleepMs ?? 15000);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.log(`Stopping EMA+ADX trend strategy on ${this.symbol}`);
  }

  constructor(private readonly binanceService: BinanceService) {}

  private async getAnalysis(): Promise<{
    currentPrice: number;
    atr: number;
    emaFast: number;
    emaSlow: number;
    adx: number;
    plusDI: number;
    minusDI: number;
  } | null> {
    const interval = this.config.interval ?? '1m';
    const limit = Math.max(
      this.getEmaSlowPeriod() + 5,
      this.getAdxPeriod() + 5,
      this.getAtrPeriod() + 5,
      80,
    );

    const candles = await this.binanceService.getCandles(this.symbol, interval, limit);
    if (!candles || candles.length < 30) {
      this.logger.warn(`Not enough candles for ${this.symbol}`);
      return null;
    }

    const highs = candles.map((c) => parseFloat(c.high));
    const lows = candles.map((c) => parseFloat(c.low));
    const closes = candles.map((c) => parseFloat(c.close));

    const emaFastSeries = EMA.calculate({ period: this.getEmaFastPeriod(), values: closes });
    const emaSlowSeries = EMA.calculate({ period: this.getEmaSlowPeriod(), values: closes });
    const adxSeries = ADX.calculate({
      period: this.getAdxPeriod(),
      high: highs,
      low: lows,
      close: closes,
    });
    const atrSeries = ATR.calculate({
      period: this.getAtrPeriod(),
      high: highs,
      low: lows,
      close: closes,
    });

    if (!emaFastSeries.length || !emaSlowSeries.length || !adxSeries.length || !atrSeries.length) {
      return null;
    }

    const lastAdx = adxSeries[adxSeries.length - 1];
    const currentPriceResp = await this.binanceService.getSymbolPrice(this.symbol);
    const currentPrice = parseFloat(currentPriceResp.price);

    return {
      currentPrice,
      atr: atrSeries[atrSeries.length - 1],
      emaFast: emaFastSeries[emaFastSeries.length - 1],
      emaSlow: emaSlowSeries[emaSlowSeries.length - 1],
      adx: lastAdx.adx,
      plusDI: lastAdx.pdi,
      minusDI: lastAdx.mdi,
    };
  }

  private validateConfig(): void {
    if (!this.config || this.config.tradeQuantity <= 0) {
      throw new Error('tradeQuantity es requerido y debe ser > 0');
    }

    if (this.getEmaFastPeriod() >= this.getEmaSlowPeriod()) {
      throw new Error('emaFastPeriod debe ser menor que emaSlowPeriod');
    }

    if (this.getAdxThreshold() <= 0) {
      throw new Error('adxThreshold debe ser > 0');
    }
  }

  private resetPosition(): void {
    this.inPosition = false;
    this.entryPrice = null;
    this.stopLossPrice = null;
    this.takeProfitPrice = null;
  }

  private roundToStep(value: number, step: string): number {
    return StrategyRuntimeUtils.roundToStep(value, step);
  }

  private sleep(ms: number): Promise<void> {
    return StrategyRuntimeUtils.sleepInterruptible(ms, () => this.isRunning);
  }

  private getEmaFastPeriod(): number {
    return this.config.emaFastPeriod ?? 9;
  }

  private getEmaSlowPeriod(): number {
    return this.config.emaSlowPeriod ?? 21;
  }

  private getAdxPeriod(): number {
    return this.config.adxPeriod ?? 14;
  }

  private getAtrPeriod(): number {
    return this.config.atrPeriod ?? 14;
  }

  private getAdxThreshold(): number {
    return this.config.adxThreshold ?? 20;
  }

  private getStopLossAtrMultiplier(): number {
    return this.config.stopLossAtrMultiplier ?? 1.0;
  }

  private getTakeProfitAtrMultiplier(): number {
    return this.config.takeProfitAtrMultiplier ?? 1.5;
  }
}
