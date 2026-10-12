import type { MarketRegimeResult } from '../market-regime/market-regime.types';
import type { MultiTimeframeResult } from '../market-regime/multi-timeframe';
import type { IndicatorSnapshot } from '../indicators/indicators.service';
import { computeConfluence } from './confluence.calculator';

const regime = (
  overrides: Partial<MarketRegimeResult> = {},
): MarketRegimeResult => ({
  symbol: 'BTCUSDT',
  timeframe: '15m',
  candleCloseTime: 1_700_000_000_000,
  regime: 'BULL_TREND_NORMAL_VOL',
  trend: 'BULL_TREND',
  volatility: 'NORMAL',
  volume: 'NORMAL',
  confidence: 80,
  trendStrengthPct: 0.5,
  atrPct: 1,
  efficiencyRatio: 0.6,
  volumeRatio: 1,
  indicators: {
    ema20: 101,
    ema50: 100,
    atr14: 1,
    baselineRangePct: 1,
    samples: 200,
  },
  ...overrides,
});

const mtf = (
  overrides: Partial<MultiTimeframeResult> = {},
): MultiTimeframeResult => ({
  score: 80,
  aligned: true,
  minScore: 60,
  contexts: [],
  ...overrides,
});

const indicators = (
  overrides: Partial<IndicatorSnapshot> = {},
): IndicatorSnapshot => ({
  symbol: 'BTCUSDT',
  interval: '15m',
  lastClose: 100,
  rsi: 65,
  bollinger: {
    middle: 100,
    upper: 105,
    lower: 95,
    bandwidth: 0.1,
    percentB: 0.8,
  },
  macd: { macd: 1, signal: 0.5, histogram: 0.5 },
  atr: 1,
  vwap: 100,
  trend: {
    direction: 'UP',
    strength: 0.5,
    emaFast: 101,
    emaSlow: 100,
    slope: 1,
  },
  emaFast: 101,
  emaSlow: 100,
  timestamp: new Date(),
  ...overrides,
});

describe('computeConfluence', () => {
  it('scores BULLISH when regime, multi-timeframe and momentum all agree upward', () => {
    const result = computeConfluence(regime(), mtf(), indicators());

    expect(result.bias).toBe('BULLISH');
    expect(result.score).toBeGreaterThan(50);
    expect(result.confidence).toBeGreaterThan(50);
    expect(result.breakdown.components).toHaveLength(3);
  });

  it('scores BEARISH when every component points down', () => {
    const result = computeConfluence(
      regime({ trend: 'BEAR_TREND' }),
      mtf({ score: 20, aligned: false }),
      indicators({
        rsi: 35,
        macd: { macd: -1, signal: -0.5, histogram: -0.5 },
        bollinger: {
          middle: 100,
          upper: 105,
          lower: 95,
          bandwidth: 0.1,
          percentB: 0.2,
        },
      }),
    );

    expect(result.bias).toBe('BEARISH');
    expect(result.score).toBeLessThan(50);
  });

  it('stays NEUTRAL when the market is ranging with no momentum edge', () => {
    const result = computeConfluence(
      regime({ trend: 'RANGE' }),
      mtf({ score: 50, aligned: false }),
      indicators({
        rsi: 50,
        macd: { macd: 0, signal: 0, histogram: 0 },
        bollinger: {
          middle: 100,
          upper: 105,
          lower: 95,
          bandwidth: 0.1,
          percentB: 0.5,
        },
      }),
    );

    expect(result.bias).toBe('NEUTRAL');
    expect(result.score).toBeCloseTo(50, 0);
  });

  it('caps confidence low when the primary regime is UNKNOWN regardless of agreement', () => {
    const result = computeConfluence(
      regime({ trend: 'UNKNOWN', confidence: 20 }),
      mtf({ score: 50 }),
      indicators({ rsi: 50, macd: null, bollinger: null }),
    );

    expect(result.confidence).toBeLessThanOrEqual(30);
  });

  it('marks momentum sub-components as missing data without crashing', () => {
    const result = computeConfluence(
      regime(),
      mtf(),
      indicators({ rsi: null, macd: null, bollinger: null }),
    );

    expect(result.breakdown.momentum.every((m) => m.score === null)).toBe(true);
    expect(result.momentumScore).toBe(50);
  });

  it('respects custom weights passed via config', () => {
    const onlyMomentum = computeConfluence(
      regime(),
      mtf({ score: 0 }),
      indicators(),
      {
        weights: { regime: 0, multiTimeframe: 0, momentum: 1 },
      },
    );

    expect(onlyMomentum.score).toBeCloseTo(onlyMomentum.momentumScore, 1);
  });
});

function okForecast(forecastPrice: number, lastPrice = 100) {
  return {
    status: 'OK' as const,
    lastPrice,
    forecastPrice,
    lowerBound: forecastPrice - 1,
    upperBound: forecastPrice + 1,
    confidencePct: 95,
    volatilityForecast: 0.01,
    modelType: 'AR+GARCH' as const,
    modelParams: null,
    samplesUsed: 300,
  };
}

describe('computeConfluence -- priceForecast component', () => {
  it('does not add the component (and leaves the score unchanged) when no forecast is passed', () => {
    const withForecast = computeConfluence(regime(), mtf(), indicators(), {}, undefined);
    const withoutForecast = computeConfluence(regime(), mtf(), indicators());

    expect(withForecast.score).toBe(withoutForecast.score);
    expect(
      withForecast.breakdown.components.some((c) => c.name === 'priceForecast'),
    ).toBe(false);
  });

  it('does not add the component when the forecast status is INSUFFICIENT_DATA', () => {
    const result = computeConfluence(regime(), mtf(), indicators(), {}, {
      status: 'INSUFFICIENT_DATA',
      lastPrice: 100,
      forecastPrice: 0,
      lowerBound: 0,
      upperBound: 0,
      confidencePct: 95,
      volatilityForecast: 0,
      modelType: 'AR+GARCH',
      modelParams: null,
      samplesUsed: 10,
    });

    expect(
      result.breakdown.components.some((c) => c.name === 'priceForecast'),
    ).toBe(false);
  });

  it('pushes the score up when the forecast expects a rise, using the default weight', () => {
    const baseline = computeConfluence(regime(), mtf(), indicators());
    const withBullishForecast = computeConfluence(
      regime(),
      mtf(),
      indicators(),
      {},
      okForecast(102, 100), // +2% -> satura el componente en score 100
    );

    const component = withBullishForecast.breakdown.components.find(
      (c) => c.name === 'priceForecast',
    );
    expect(component?.score).toBe(100);
    expect(component?.weight).toBe(0.2); // DEFAULT_PRICE_FORECAST_WEIGHT
    expect(withBullishForecast.score).toBeGreaterThan(baseline.score);
  });

  it('pulls the score down when the forecast expects a drop', () => {
    const baseline = computeConfluence(regime(), mtf(), indicators());
    const withBearishForecast = computeConfluence(
      regime(),
      mtf(),
      indicators(),
      {},
      okForecast(98, 100), // -2% -> satura el componente en score 0
    );

    const component = withBearishForecast.breakdown.components.find(
      (c) => c.name === 'priceForecast',
    );
    expect(component?.score).toBe(0);
    expect(withBearishForecast.score).toBeLessThan(baseline.score);
  });

  it('honors a custom weights.priceForecast', () => {
    const result = computeConfluence(
      regime(),
      mtf(),
      indicators(),
      { weights: { regime: 0.4, multiTimeframe: 0.35, momentum: 0.25, priceForecast: 0.5 } },
      okForecast(102, 100),
    );

    const component = result.breakdown.components.find(
      (c) => c.name === 'priceForecast',
    );
    expect(component?.weight).toBe(0.5);
  });
});
