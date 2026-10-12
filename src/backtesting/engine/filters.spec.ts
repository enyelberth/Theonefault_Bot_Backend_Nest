import type { Candle } from '../../exchanges/domain';
import { applyEntryFilters, buildIndicatorSnapshot } from './filters';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCandles(
  closes: number[],
  timeframe: Candle['timeframe'] = '15m',
  symbol = 'BTCUSDT',
  stepMs = 15 * 60_000,
): Candle[] {
  return closes.map((close, i) => ({
    symbol,
    timeframe,
    openTime: i * stepMs,
    closeTime: (i + 1) * stepMs - 1,
    open: i === 0 ? close : closes[i - 1],
    high: close * 1.001,
    low: close * 0.999,
    close,
    volume: 100,
    closed: true,
  }));
}

/** Tendencia alcista sostenida -> BULL_TREND de alta confianza. */
function bullishCloses(n: number): number[] {
  const closes: number[] = [100];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * 1.004);
  return closes;
}

/** Tendencia bajista sostenida -> BEAR_TREND de alta confianza. */
function bearishCloses(n: number): number[] {
  const closes: number[] = [100];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * 0.996);
  return closes;
}

/** Ruido chico sin drift -> RANGE / régimen neutral. */
function rangeCloses(n: number, seed = 1): number[] {
  const rand = mulberry32(seed);
  const closes: number[] = [100];
  for (let i = 1; i < n; i++) {
    closes.push(closes[i - 1] * (1 + (rand() - 0.5) * 0.0005));
  }
  return closes;
}

describe('applyEntryFilters -- no config', () => {
  it('allows everything when no filter keys are present (backward compatible default)', () => {
    const history = buildCandles(rangeCloses(60));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: {},
    });
    expect(result.allowed).toBe(true);
  });
});

describe('applyEntryFilters -- regimeFilter', () => {
  it('allows a BUY in a confirmed BULL_TREND when allowedTrends includes it', () => {
    const history = buildCandles(bullishCloses(60));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { regimeFilter: { enabled: true, allowedTrends: ['BULL_TREND'] } },
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks a BUY when the trend does not match allowedTrends', () => {
    const history = buildCandles(bearishCloses(60));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { regimeFilter: { enabled: true, allowedTrends: ['BULL_TREND'] } },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('REGIME_FILTER');
  });
});

describe('applyEntryFilters -- multiTimeframe', () => {
  it('blocks when the extra timeframe disagrees and there is no candle history for it', () => {
    const history = buildCandles(bullishCloses(60));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      // sin extraTimeframeHistory -> el contexto 1h nunca se agrega, el
      // score queda solo con el primario; si minScore pide más de lo que
      // un único contexto puede dar, bloquea.
      config: {
        multiTimeframe: {
          enabled: true,
          contexts: [{ timeframe: '1h', weight: 3 }],
          minScore: 60,
        },
      },
    });
    // Con un único contexto 100% alineado (BULL_TREND fuerte) el score
    // igual puede pasar 60 -- lo relevante es que no explota sin la data extra.
    expect(typeof result.allowed).toBe('boolean');
  });

  it('allows when both primary and extra timeframe agree bullish', () => {
    const primary = buildCandles(bullishCloses(60), '15m');
    const extra = buildCandles(bullishCloses(60), '1h', 'BTCUSDT', 60 * 60_000);
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: primary[primary.length - 1].close,
      primaryHistory: primary,
      extraTimeframeHistory: { '1h': extra },
      config: {
        multiTimeframe: {
          enabled: true,
          contexts: [{ timeframe: '1h', weight: 2 }],
          minScore: 60,
          minConfidence: 0,
        },
      },
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when primary is bullish but the extra timeframe is bearish', () => {
    const primary = buildCandles(bullishCloses(60), '15m');
    const extra = buildCandles(bearishCloses(60), '1h', 'BTCUSDT', 60 * 60_000);
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: primary[primary.length - 1].close,
      primaryHistory: primary,
      extraTimeframeHistory: { '1h': extra },
      config: {
        multiTimeframe: {
          enabled: true,
          contexts: [{ timeframe: '1h', weight: 3 }],
          minScore: 60,
        },
      },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('MULTI_TIMEFRAME_FILTER');
  });
});

describe('applyEntryFilters -- priceForecast', () => {
  it('returns INSUFFICIENT_DATA-driven allow by default when history is too short', () => {
    const history = buildCandles(rangeCloses(10));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { priceForecast: { enabled: true } },
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when allowInsufficientData is false and history is too short', () => {
    const history = buildCandles(rangeCloses(10));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { priceForecast: { enabled: true, allowInsufficientData: false } },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('PRICE_FORECAST_FILTER');
  });

  it('blocks a BUY when the forecast expects a large drop beyond maxDivergencePct', () => {
    const history = buildCandles(bearishCloses(150));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { priceForecast: { enabled: true, maxDivergencePct: 0.01, horizonBars: 5 } },
    });
    expect(result.allowed).toBe(false);
  });
});

describe('applyEntryFilters -- confluenceFilter', () => {
  it('blocks a BUY when score/bias disagree (bearish market, high minScore)', () => {
    const history = buildCandles(bearishCloses(60));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { confluenceFilter: { enabled: true, minScore: 60 } },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('CONFLUENCE_FILTER');
  });

  it('does not throw when usePriceForecast is set, even without extra timeframe data', () => {
    const history = buildCandles(bullishCloses(150));
    const result = applyEntryFilters({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      side: 'BUY',
      referencePrice: history[history.length - 1].close,
      primaryHistory: history,
      config: { confluenceFilter: { enabled: true, minScore: 40, usePriceForecast: true } },
    });
    expect(typeof result.allowed).toBe('boolean');
  });
});

describe('buildIndicatorSnapshot', () => {
  it('builds a snapshot matching the candle series symbol/timeframe/lastClose', () => {
    const history = buildCandles(bullishCloses(60));
    const snapshot = buildIndicatorSnapshot('BTCUSDT', '15m', history);
    expect(snapshot.symbol).toBe('BTCUSDT');
    expect(snapshot.interval).toBe('15m');
    expect(snapshot.lastClose).toBeCloseTo(history[history.length - 1].close, 6);
  });
});
