export type ConfluenceBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface ConfluenceWeights {
  regime: number;
  multiTimeframe: number;
  momentum: number;
  /**
   * Peso del forecast AR+GARCH (src/market-prediction). Solo se usa si
   * `compute()` recibe un forecast válido -- sin él, el componente ni
   * siquiera se agrega y el score se comporta exactamente como antes
   * (compatibilidad hacia atrás).
   */
  priceForecast?: number;
}

export const DEFAULT_CONFLUENCE_WEIGHTS: ConfluenceWeights = {
  regime: 0.4,
  multiTimeframe: 0.35,
  momentum: 0.25,
};

export const DEFAULT_PRICE_FORECAST_WEIGHT = 0.2;

export interface ConfluenceConfig {
  weights?: ConfluenceWeights;
  /** Zona muerta alrededor de 50 que se considera NEUTRAL. Default 5. */
  neutralBandPts?: number;
  /** Timeframes extra para el componente multi-timeframe (el primario ya participa con peso 1). */
  extraTimeframes?: Array<{ timeframe: string; weight?: number }>;
  /**
   * Si se pasa, agrega el componente priceForecast al score. `false`
   * (default) deja el cálculo idéntico a como era antes de que existiera
   * el forecast de precio.
   */
  usePriceForecast?: boolean;
  /** Horizonte en velas para el forecast de precio. Default 5. */
  priceForecastHorizonBars?: number;
}

export interface ConfluenceComponentDetail {
  name: 'regime' | 'multiTimeframe' | 'momentum' | 'priceForecast';
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
