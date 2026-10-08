export type TrendRegime = 'BULL_TREND' | 'BEAR_TREND' | 'RANGE' | 'UNKNOWN';
export type VolatilityRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';
export type VolumeRegime = 'LOW' | 'NORMAL' | 'HIGH' | 'UNKNOWN';

export interface MarketRegimeResult {
  symbol: string;
  timeframe: string;
  candleCloseTime: number;
  regime: string;
  trend: TrendRegime;
  volatility: VolatilityRegime;
  volume: VolumeRegime;
  confidence: number;
  trendStrengthPct: number | null;
  atrPct: number | null;
  efficiencyRatio: number | null;
  volumeRatio: number | null;
  indicators: {
    ema20: number | null;
    ema50: number | null;
    atr14: number | null;
    baselineRangePct: number | null;
    samples: number;
  };
}

export interface RegimeFilterConfig {
  enabled?: boolean;
  allowedRegimes?: string[];
  allowedTrends?: TrendRegime[];
  blockedVolatility?: VolatilityRegime[];
  minConfidence?: number;
  allowUnknown?: boolean;
}
