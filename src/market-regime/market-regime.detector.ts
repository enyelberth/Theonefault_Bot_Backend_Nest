import type { Candle } from '../exchanges/domain';
import type {
  MarketRegimeResult,
  RegimeFilterConfig,
  TrendRegime,
  VolatilityRegime,
  VolumeRegime,
} from './market-regime.types';

const MIN_SAMPLES = 50;

const ema = (values: number[], period: number): number | null => {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let result =
    values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) {
    result = (value - result) * multiplier + result;
  }
  return result;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const average = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number, decimals = 8): number => {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const trueRanges = (candles: Candle[]): number[] =>
  candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

export function detectMarketRegime(
  symbol: string,
  timeframe: string,
  inputCandles: ReadonlyArray<Candle>,
): MarketRegimeResult {
  const candles = [...inputCandles]
    .filter((candle) => candle.close > 0)
    .sort((a, b) => a.closeTime - b.closeTime);
  const latest = candles.at(-1);
  const unknown: MarketRegimeResult = {
    symbol,
    timeframe,
    candleCloseTime: latest?.closeTime ?? Date.now(),
    regime: 'UNKNOWN_UNKNOWN_VOL',
    trend: 'UNKNOWN',
    volatility: 'UNKNOWN',
    volume: 'UNKNOWN',
    confidence: Math.min(40, round((candles.length / MIN_SAMPLES) * 40, 2)),
    trendStrengthPct: null,
    atrPct: null,
    efficiencyRatio: null,
    volumeRatio: null,
    indicators: {
      ema20: null,
      ema50: null,
      atr14: null,
      baselineRangePct: null,
      samples: candles.length,
    },
  };
  if (!latest || candles.length < MIN_SAMPLES) return unknown;

  const closes = candles.map((candle) => candle.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  if (ema20 === null || ema50 === null) return unknown;
  const trendStrengthPct = (Math.abs(ema20 - ema50) / latest.close) * 100;
  const efficiencyWindow = closes.slice(-20);
  const direction = Math.abs(efficiencyWindow.at(-1)! - efficiencyWindow[0]);
  const path = efficiencyWindow
    .slice(1)
    .reduce(
      (sum, value, index) => sum + Math.abs(value - efficiencyWindow[index]),
      0,
    );
  const efficiencyRatio = path > 0 ? direction / path : 0;

  let trend: TrendRegime = 'RANGE';
  if (trendStrengthPct >= 0.15 && efficiencyRatio >= 0.25) {
    trend = ema20 > ema50 ? 'BULL_TREND' : 'BEAR_TREND';
  }

  const ranges = trueRanges(candles);
  const atr14 = average(ranges.slice(-14));
  const atrPct = (atr14 / latest.close) * 100;
  const rangePercentages = candles
    .slice(-31)
    .slice(1)
    .map((candle, index) => {
      const previous = candles.slice(-31)[index].close;
      const range = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous),
        Math.abs(candle.low - previous),
      );
      return previous > 0 ? (range / previous) * 100 : 0;
    });
  const baselineRangePct = median(rangePercentages) ?? atrPct;
  const volatilityRatio = baselineRangePct > 0 ? atrPct / baselineRangePct : 1;
  let volatility: VolatilityRegime = 'NORMAL';
  if (volatilityRatio < 0.7) volatility = 'LOW';
  if (volatilityRatio > 1.5) volatility = 'HIGH';

  const previousVolumes = candles.slice(-21, -1).map((candle) => candle.volume);
  const averageVolume = average(previousVolumes);
  const volumeRatio = averageVolume > 0 ? latest.volume / averageVolume : 1;
  let volume: VolumeRegime = 'NORMAL';
  if (volumeRatio < 0.6) volume = 'LOW';
  if (volumeRatio > 1.8) volume = 'HIGH';

  const dataConfidence = Math.min(1, candles.length / 100);
  const separationConfidence = Math.min(1, trendStrengthPct / 0.75);
  const behaviorConfidence =
    trend === 'RANGE'
      ? Math.min(1, (1 - efficiencyRatio) / 0.75)
      : Math.min(1, efficiencyRatio / 0.6);
  const confidence =
    (dataConfidence * 0.35 +
      separationConfidence * 0.3 +
      behaviorConfidence * 0.35) *
    100;

  return {
    symbol,
    timeframe,
    candleCloseTime: latest.closeTime,
    regime: `${trend}_${volatility}_VOL`,
    trend,
    volatility,
    volume,
    confidence: round(confidence, 2),
    trendStrengthPct: round(trendStrengthPct),
    atrPct: round(atrPct),
    efficiencyRatio: round(efficiencyRatio),
    volumeRatio: round(volumeRatio),
    indicators: {
      ema20: round(ema20),
      ema50: round(ema50),
      atr14: round(atr14),
      baselineRangePct: round(baselineRangePct),
      samples: candles.length,
    },
  };
}

/**
 * Lógica pura de MarketRegimeService.allows() -- extraída acá para que el
 * backtest engine pueda aplicar el mismo filtro que el bot runner en vivo
 * sin depender de PrismaClient ni de la clase del servicio.
 */
export function regimeAllowsFilter(
  result: MarketRegimeResult,
  config?: RegimeFilterConfig,
): boolean {
  if (!config?.enabled) return true;
  if (result.trend === 'UNKNOWN') return config.allowUnknown === true;
  if (
    config.minConfidence !== undefined &&
    result.confidence < config.minConfidence
  ) {
    return false;
  }
  if (
    config.allowedRegimes?.length &&
    !config.allowedRegimes.includes(result.regime)
  ) {
    return false;
  }
  if (
    config.allowedTrends?.length &&
    !config.allowedTrends.includes(result.trend)
  ) {
    return false;
  }
  if (config.blockedVolatility?.includes(result.volatility)) return false;
  return true;
}
