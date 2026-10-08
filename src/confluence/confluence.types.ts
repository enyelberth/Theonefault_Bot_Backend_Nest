export type ConfluenceBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface ConfluenceWeights {
  regime: number;
  multiTimeframe: number;
  momentum: number;
}

export const DEFAULT_CONFLUENCE_WEIGHTS: ConfluenceWeights = {
  regime: 0.4,
  multiTimeframe: 0.35,
  momentum: 0.25,
};

export interface ConfluenceConfig {
  weights?: ConfluenceWeights;
  /** Zona muerta alrededor de 50 que se considera NEUTRAL. Default 5. */
  neutralBandPts?: number;
  /** Timeframes extra para el componente multi-timeframe (el primario ya participa con peso 1). */
  extraTimeframes?: Array<{ timeframe: string; weight?: number }>;
}

export interface ConfluenceComponentDetail {
  name: 'regime' | 'multiTimeframe' | 'momentum';
  score: number; // 0-100
  weight: number;
  contribution: number; // score * weight
  reason: string;
}

export interface MomentumComponentDetail {
  name: 'rsi' | 'macd' | 'bollinger';
  value: number | null;
  score: number | null; // -1..1, null si falta data
  reason: string;
}

export interface ConfluenceResult {
  symbol: string;
  timeframe: string;
  candleCloseTime: number;
  score: number; // 0-100, 50 = neutral
  bias: ConfluenceBias;
  confidence: number; // 0-100
  regimeScore: number;
  mtfScore: number;
  momentumScore: number;
  breakdown: {
    components: ConfluenceComponentDetail[];
    momentum: MomentumComponentDetail[];
    regimeTrend: string;
    regimeConfidence: number;
    mtfAligned: boolean;
    samples: number;
  };
}
