import type { MarketRegimeResult } from './market-regime.types';

export interface TimeframeContext {
  timeframe: string;
  weight: number;
  regime: MarketRegimeResult;
}
export interface MultiTimeframeResult {
  score: number;
  aligned: boolean;
  minScore: number;
  contexts: TimeframeContext[];
}
export interface MultiTimeframeConfig {
  enabled?: boolean;
  contexts: Array<{ timeframe: string; weight?: number }>;
  minScore?: number;
  minConfidence?: number;
  allowUnknown?: boolean;
  warmupBars?: number;
}

export function evaluateTimeframeAlignment(
  side: 'BUY' | 'SELL',
  contexts: TimeframeContext[],
  minScore = 60,
  minConfidence = 0,
  allowUnknown = false,
): MultiTimeframeResult {
  const eligible = contexts.filter(
    (item) => allowUnknown || item.regime.trend !== 'UNKNOWN',
  );
  const confidenceOk = eligible.every(
    (item) => item.regime.confidence >= minConfidence,
  );
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  const signed = eligible.reduce((sum, item) => {
    const trend = item.regime.trend;
    const direction =
      trend === 'RANGE' || trend === 'UNKNOWN'
        ? 0
        : (trend === 'BULL_TREND') === (side === 'BUY')
          ? 1
          : -1;
    return sum + direction * item.weight * (item.regime.confidence / 100);
  }, 0);
  const score =
    totalWeight > 0
      ? Math.round(((signed / totalWeight + 1) / 2) * 10_000) / 100
      : 0;
  return {
    score,
    aligned:
      eligible.length === contexts.length && confidenceOk && score >= minScore,
    minScore,
    contexts,
  };
}
