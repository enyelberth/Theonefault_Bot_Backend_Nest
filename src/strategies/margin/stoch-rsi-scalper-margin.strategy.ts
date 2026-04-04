import { Injectable, Logger } from '@nestjs/common';
import { ATR, EMA, SMA, StochasticRSI } from 'technicalindicators';
import { BinanceService } from '../../binance/binance.service';
import { StochRsiScalperStrategyConfig, TradingStrategy } from '../trading-strategy.interface';
import { StrategyRuntimeUtils } from '../shared/strategy-runtime.utils';

@Injectable()
export class StochRsiScalperMarginStrategy implements TradingStrategy<StochRsiScalperStrategyConfig> {
  id: string;
  symbol: string;
  config: StochRsiScalperStrategyConfig;

  private readonly logger = new Logger(StochRsiScalperMarginStrategy.name);
  private isRunning = true;

  private inPosition = false;
  private stopLossPrice: number | null = null;
  private takeProfitPrice: number | null = null;
  private openedCandleIndex: number | null = null;

  constructor(private readonly binanceService: BinanceService) {}

  async run(): Promise<void> {
    this.validateConfig();
    this.logger.log(`Starting StochRSI scalper margin on ${this.symbol}`);

    const { lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!lotSizeFilter?.stepSize) {
      throw new Error(`Lot size filter not found for ${this.symbol}`);
    }

    while (this.isRunning) {
      try {
        const snapshot = await this.getSnapshot();
        if (!snapshot) {
          await this.sleep(this.config.minSleepMs ?? 5000);
          continue;
        }

        const {
          currentPrice,
          atr,
          emaFast,
          emaSlow,
          stochK,
          stochD,
          prevStochK,
          prevStochD,
          volume,
          avgVolume,
          candlesCount,
        } = snapshot;

        const quantity = this.roundToStep(this.config.tradeQuantity, lotSizeFilter.stepSize);
        if (quantity <= 0) {
          throw new Error('tradeQuantity ajustado por lotSize queda en 0');
        }

        const bullishTrend = emaFast > emaSlow;
        const bearishTrend = emaFast < emaSlow;
        const volumeOk = volume >= avgVolume * this.getVolumeMultiplier();
        const lowerBand = this.getLowerBand();
        const upperBand = this.getUpperBand();

        const crossUp = prevStochK <= prevStochD && stochK > stochD;
        const crossDown = prevStochK >= prevStochD && stochK < stochD;

        const longSignal = bullishTrend && volumeOk && crossUp && stochK <= lowerBand;

        if (!this.inPosition && longSignal) {
          await this.binanceService.createCrossMarginMarketOrder(this.symbol, 'BUY', quantity.toString());
          this.inPosition = true;
          this.stopLossPrice = currentPrice - atr * this.getStopLossAtrMultiplier();
          this.takeProfitPrice = currentPrice + atr * this.getTakeProfitAtrMultiplier();
          this.openedCandleIndex = candlesCount;
          this.logger.log(
            `MARGIN BUY ${this.symbol} @ ${currentPrice}. K=${stochK.toFixed(2)} D=${stochD.toFixed(2)} Vol=${volume.toFixed(4)}`,
          );
        } else if (this.inPosition) {
          const hitStop = this.stopLossPrice !== null && currentPrice <= this.stopLossPrice;
          const hitTakeProfit = this.takeProfitPrice !== null && currentPrice >= this.takeProfitPrice;
          const momentumExit = crossDown && stochK >= upperBand;
          const trendExit = bearishTrend;
          const timeoutExit =
            this.openedCandleIndex !== null &&
            candlesCount - this.openedCandleIndex >= this.getMaxTradeDurationCandles();

          if (hitStop || hitTakeProfit || momentumExit || trendExit || timeoutExit) {
            await this.binanceService.createCrossMarginMarketOrder(this.symbol, 'SELL', quantity.toString());
            this.logger.log(
              `MARGIN SELL ${this.symbol} @ ${currentPrice}. reason=${hitStop ? 'stop' : hitTakeProfit ? 'take_profit' : momentumExit ? 'momentum_exit' : trendExit ? 'trend_exit' : 'timeout'}`,
            );
            this.resetPosition();
          }
        }
      } catch (error) {
        this.logger.error('Error in StochRSI scalper margin loop', error instanceof Error ? error.stack : String(error));
        await StrategyRuntimeUtils.exponentialBackoff(
          5000,
          3,
          () => this.isRunning,
          (waitTime) => this.logger.warn(`Retrying in ${waitTime} ms`),
        );
      }

      await this.sleep(this.config.minSleepMs ?? 5000);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.log(`Stopping StochRSI scalper margin on ${this.symbol}`);
  }

  private async getSnapshot(): Promise<{
    currentPrice: number;
    atr: number;
    emaFast: number;
    emaSlow: number;
    stochK: number;
    stochD: number;
    prevStochK: number;
    prevStochD: number;
    volume: number;
    avgVolume: number;
    candlesCount: number;
  } | null> {
    const interval = this.config.interval ?? '1m';
    const lookback = Math.max(this.getEmaSlowPeriod(), this.getStochRsiPeriod(), this.getAtrPeriod(), this.getVolumeLookback()) + 30;

    const candles = await this.binanceService.getCandles(this.symbol, interval, lookback);
    if (!candles || candles.length < 40) {
      return null;
    }

    const highs = candles.map((c) => parseFloat(c.high));
    const lows = candles.map((c) => parseFloat(c.low));
    const closes = candles.map((c) => parseFloat(c.close));
    const volumes = candles.map((c) => parseFloat(c.volume));

    const emaFastSeries = EMA.calculate({ period: this.getEmaFastPeriod(), values: closes });
    const emaSlowSeries = EMA.calculate({ period: this.getEmaSlowPeriod(), values: closes });
    const atrSeries = ATR.calculate({ period: this.getAtrPeriod(), high: highs, low: lows, close: closes });
    const stochRsiSeries = StochasticRSI.calculate({
      values: closes,
      rsiPeriod: this.getStochRsiPeriod(),
      stochasticPeriod: this.getStochRsiPeriod(),
      kPeriod: this.getStochKPeriod(),
      dPeriod: this.getStochDPeriod(),
    });

    const volumeSma = SMA.calculate({ period: this.getVolumeLookback(), values: volumes });

    if (
      !emaFastSeries.length ||
      !emaSlowSeries.length ||
      !atrSeries.length ||
      stochRsiSeries.length < 2 ||
      !volumeSma.length
    ) {
      return null;
    }

    const currentPriceResp = await this.binanceService.getSymbolPrice(this.symbol);
    const currentPrice = parseFloat(currentPriceResp.price);

    const lastStoch = stochRsiSeries[stochRsiSeries.length - 1];
    const prevStoch = stochRsiSeries[stochRsiSeries.length - 2];

    return {
      currentPrice,
      atr: atrSeries[atrSeries.length - 1],
      emaFast: emaFastSeries[emaFastSeries.length - 1],
      emaSlow: emaSlowSeries[emaSlowSeries.length - 1],
      stochK: lastStoch.k,
      stochD: lastStoch.d,
      prevStochK: prevStoch.k,
      prevStochD: prevStoch.d,
      volume: volumes[volumes.length - 1],
      avgVolume: volumeSma[volumeSma.length - 1],
      candlesCount: candles.length,
    };
  }

  private validateConfig(): void {
    if (!this.config || this.config.tradeQuantity <= 0) {
      throw new Error('tradeQuantity es requerido y debe ser > 0');
    }

    if (this.getEmaFastPeriod() >= this.getEmaSlowPeriod()) {
      throw new Error('emaFastPeriod debe ser menor que emaSlowPeriod');
    }
  }

  private resetPosition(): void {
    this.inPosition = false;
    this.stopLossPrice = null;
    this.takeProfitPrice = null;
    this.openedCandleIndex = null;
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

  private getStochRsiPeriod(): number {
    return this.config.stochRsiPeriod ?? 14;
  }

  private getStochKPeriod(): number {
    return this.config.stochRsiKPeriod ?? 3;
  }

  private getStochDPeriod(): number {
    return this.config.stochRsiDPeriod ?? 3;
  }

  private getLowerBand(): number {
    return this.config.stochRsiLowerBand ?? 25;
  }

  private getUpperBand(): number {
    return this.config.stochRsiUpperBand ?? 80;
  }

  private getAtrPeriod(): number {
    return this.config.atrPeriod ?? 14;
  }

  private getStopLossAtrMultiplier(): number {
    return this.config.stopLossAtrMultiplier ?? 1.0;
  }

  private getTakeProfitAtrMultiplier(): number {
    return this.config.takeProfitAtrMultiplier ?? 1.5;
  }

  private getVolumeLookback(): number {
    return this.config.volumeLookback ?? 20;
  }

  private getVolumeMultiplier(): number {
    return this.config.volumeMultiplier ?? 1.2;
  }

  private getMaxTradeDurationCandles(): number {
    return this.config.maxTradeDurationCandles ?? 12;
  }
}
