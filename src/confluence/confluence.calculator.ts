import type { MarketRegimeResult } from '../market-regime/market-regime.types';
import type { MultiTimeframeResult } from '../market-regime/multi-timeframe';
import type { IndicatorSnapshot } from '../indicators/indicators.service';
import type { PriceForecastOutput } from '../market-prediction/price-forecast.calculator';
import {
  ConfluenceConfig,
  ConfluenceComponentDetail,
  ConfluenceResult,
  DEFAULT_CONFLUENCE_WEIGHTS,
  DEFAULT_PRICE_FORECAST_WEIGHT,
  MomentumComponentDetail,
} from './confluence.types';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, decimals = 2): number => {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

/**
 * Lee RSI/MACD/Bollinger como lectura de MOMENTUM (continuación), no de
 * sobrecompra/sobreventa contraria: RSI>50, histograma MACD positivo y
 * precio empujando hacia la banda superior cuentan como sesgo alcista.
 * Es una elección deliberada y documentada para que el score sea
 * consistente y explicable, no la única lectura válida de estos
 * indicadores.
 */
function momentumComponents(
  indicators: IndicatorSnapshot,
): MomentumComponentDetail[] {
  const details: MomentumComponentDetail[] = [];

  if (indicators.rsi !== null) {
    const score = clamp((indicators.rsi - 50) / 50, -1, 1);
    details.push({
      name: 'rsi',
      value: round(indicators.rsi),
      score: round(score),
      reason: `RSI ${round(indicators.rsi)} vs 50 (momentum)`,
    });
  } else {
    details.push({
      name: 'rsi',
      value: null,
      score: null,
      reason: 'sin datos suficientes',
    });
  }

  if (indicators.macd !== null && indicators.lastClose > 0) {
    const histogramBps =
      (indicators.macd.histogram / indicators.lastClose) * 10_000;
    const score = clamp(histogramBps / 20, -1, 1); // satura a ±20bps
    details.push({
      name: 'macd',
      value: round(indicators.macd.histogram, 6),
      score: round(score),
      reason: `histograma MACD ${round(histogramBps)}bps del precio (satura en ±20bps)`,
    });
  } else {
    details.push({
      name: 'macd',
      value: null,
      score: null,
      reason: 'sin datos suficientes',
    });
  }

  if (indicators.bollinger !== null) {
    const score = clamp((indicators.bollinger.percentB - 0.5) * 2, -1, 1);
    details.push({
      name: 'bollinger',
      value: round(indicators.bollinger.percentB),
      score: round(score),
      reason: `%B ${round(indicators.bollinger.percentB)} dentro de la banda`,
    });
  } else {
    details.push({
      name: 'bollinger',
      value: null,
      score: null,
      reason: 'sin datos suficientes',
    });
  }

  return details;
}

function regimeScoreOf(regime: MarketRegimeResult): number {
  if (regime.trend === 'BULL_TREND') return 50 + regime.confidence / 2;
  if (regime.trend === 'BEAR_TREND') return 50 - regime.confidence / 2;
  return 50; // RANGE o UNKNOWN: sin sesgo direccional
}

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeConfluence(
  regime: MarketRegimeResult,
  mtf: MultiTimeframeResult,
  indicators: IndicatorSnapshot,
  config: ConfluenceConfig = {},
  forecast?: PriceForecastOutput | null,
): ConfluenceResult {
  const weights = config.weights ?? DEFAULT_CONFLUENCE_WEIGHTS;
  const neutralBand = config.neutralBandPts ?? 5;

  const regimeScore = regimeScoreOf(regime);
  const mtfScore = mtf.score;

  const momentum = momentumComponents(indicators);
  const momentumValid = momentum.filter((m) => m.score !== null);
  const momentumAvg =
    momentumValid.length > 0
      ? momentumValid.reduce((sum, m) => sum + (m.score ?? 0), 0) /
        momentumValid.length
      : 0;
  const momentumScore = 50 + momentumAvg * 50;

  const components: ConfluenceComponentDetail[] = [
    {
      name: 'regime',
      score: round(regimeScore),
      weight: weights.regime,
      contribution: round(regimeScore * weights.regime),
      reason: `régimen ${regime.trend} con confianza ${round(regime.confidence)}`,
    },
    {
      name: 'multiTimeframe',
      score: round(mtfScore),
      weight: weights.multiTimeframe,
      contribution: round(mtfScore * weights.multiTimeframe),
      reason: mtf.aligned
        ? 'timeframes alineados al alza'
        : 'timeframes sin alineación plena',
    },
    {
      name: 'momentum',
      score: round(momentumScore),
      weight: weights.momentum,
      contribution: round(momentumScore * weights.momentum),
      reason: `promedio RSI/MACD/Bollinger sobre ${momentumValid.length}/3 componentes con datos`,
    },
  ];

  // Componente opcional: solo se agrega si el caller pasó un forecast
  // AR+GARCH válido (sin esto, el score es idéntico al de antes de que
  // existiera src/market-prediction -- compatibilidad hacia atrás). El
  // cambio porcentual esperado satura en ±2% (misma lógica de saturación
  // que ya usa momentum para RSI/MACD/Bollinger), igual que
  // config.priceForecast.maxDivergencePct hace de puerta binaria en
  // bot-runner -- acá en cambio es un input continuo del score.
  if (forecast && forecast.status === 'OK' && forecast.lastPrice > 0) {
    const forecastWeight = weights.priceForecast ?? DEFAULT_PRICE_FORECAST_WEIGHT;
    const expectedChangePct =
      ((forecast.forecastPrice - forecast.lastPrice) / forecast.lastPrice) * 100;
    const forecastScore = 50 + clamp(expectedChangePct / 2, -1, 1) * 50;
    components.push({
      name: 'priceForecast',
      score: round(forecastScore),
      weight: forecastWeight,
      contribution: round(forecastScore * forecastWeight),
      reason: `forecast AR+GARCH espera ${round(expectedChangePct, 3)}% en el horizonte (satura en ±2%)`,
    });
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const score =
    totalWeight > 0
      ? components.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight
      : 50;

  let bias: ConfluenceResult['bias'] = 'NEUTRAL';
  if (score >= 50 + neutralBand) bias = 'BULLISH';
  else if (score <= 50 - neutralBand) bias = 'BEARISH';

  // Confianza = qué tanto coinciden los 3 componentes entre sí. Si el
  // régimen primario es UNKNOWN (pocas velas), la confianza queda
  // acotada: no hay suficiente historia para confiar en el score.
  const agreement =
    100 - clamp(stdDev(components.map((c) => c.score)) * 2, 0, 100);
  const confidence = round(
    regime.trend === 'UNKNOWN' ? Math.min(30, agreement) : agreement,
  );

  return {
    symbol: regime.symbol,
    timeframe: regime.timeframe,
    candleCloseTime: regime.candleCloseTime,
    score: round(score),
    bias,
    confidence,
    regimeScore: round(regimeScore),
    mtfScore: round(mtfScore),
    momentumScore: round(momentumScore),
    breakdown: {
      components,
      momentum,
      regimeTrend: regime.trend,
      regimeConfidence: regime.confidence,
      mtfAligned: mtf.aligned,
      samples: regime.indicators.samples,
    },
  };
}
