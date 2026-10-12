import type { Candle, Signal } from '../../exchanges/domain';
import type { IStrategy } from '../../strategies/v2/strategy.interface';
import { runBacktest } from './simulator';

function buildCandles(closes: number[], stepMs = 15 * 60_000): Candle[] {
  return closes.map((close, i) => ({
    symbol: 'BTCUSDT',
    timeframe: '15m',
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

function bullishCloses(n: number): number[] {
  const closes: number[] = [100];
  for (let i = 1; i < n; i++) closes.push(closes[i - 1] * 1.003);
  return closes;
}

/** Abre OPEN en `openAtBar`, cierra 3 barras después. Nunca más de un ciclo. */
function buildOnceStrategy(openAtBar: number, overrides: Partial<Signal> = {}): IStrategy<any> {
  let opened = false;
  let closed = false;
  let openedAtIndex = -1;
  let barIndex = -1;
  return {
    metadata: { id: 'test-once', name: 'test-once', version: '1' },
    onCandle(candle) {
      barIndex += 1;
      if (!opened && barIndex === openAtBar) {
        opened = true;
        openedAtIndex = barIndex;
        return {
          action: 'OPEN',
          symbol: 'BTCUSDT',
          side: 'BUY',
          quoteQuantity: 100,
          emittedAt: candle.closeTime,
          ...overrides,
        };
      }
      if (opened && !closed && barIndex === openedAtIndex + 3) {
        closed = true;
        return { action: 'CLOSE', symbol: 'BTCUSDT', emittedAt: candle.closeTime };
      }
      return { action: 'HOLD', symbol: 'BTCUSDT', emittedAt: candle.closeTime };
    },
  };
}

const exchange = { id: 'test-exchange' } as any;

describe('runBacktest -- backward compatibility (no filter/risk config)', () => {
  it('opens and closes exactly as the strategy dictates when config has no filter/riskProfile keys', async () => {
    const candles = buildCandles(bullishCloses(60));
    const result = await runBacktest({
      strategy: buildOnceStrategy(10),
      strategyId: 'test-once',
      config: {},
      candles,
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 1000,
      exchange,
    });
    expect(result.trades).toHaveLength(1);
    expect(result.filteredSignals).toBe(0);
  });
});

describe('runBacktest -- regimeFilter', () => {
  it('blocks the OPEN and reports it in filteredSignals when the regime filter rejects it', async () => {
    const candles = buildCandles(bullishCloses(60));
    const result = await runBacktest({
      strategy: buildOnceStrategy(55), // suficientes velas acumuladas para un régimen confiable
      strategyId: 'test-once',
      config: { regimeFilter: { enabled: true, allowedTrends: ['BEAR_TREND'] } },
      candles,
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 1000,
      exchange,
    });
    expect(result.trades).toHaveLength(0);
    expect(result.filteredSignals).toBe(1);
  });

  it('allows the OPEN when the regime filter matches the actual trend', async () => {
    const candles = buildCandles(bullishCloses(60));
    const result = await runBacktest({
      strategy: buildOnceStrategy(55),
      strategyId: 'test-once',
      config: { regimeFilter: { enabled: true, allowedTrends: ['BULL_TREND'] } },
      candles,
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 1000,
      exchange,
    });
    expect(result.trades).toHaveLength(1);
    expect(result.filteredSignals).toBe(0);
  });
});

describe('runBacktest -- riskProfile sizing', () => {
  it('resizes the strategy-requested quoteQuantity using config.riskProfile.sizer instead of using it as-is', async () => {
    const candles = buildCandles(bullishCloses(60));
    const result = await runBacktest({
      strategy: buildOnceStrategy(10, { quoteQuantity: 99_999 }), // mucho más que el equity
      strategyId: 'test-once',
      config: {
        riskProfile: {
          maxPositionSizePct: 100,
          sizer: { type: 'fixed-pct', config: { riskPct: 0.1 } },
        },
      },
      candles,
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 1000,
      exchange,
    });
    expect(result.trades).toHaveLength(1);
    // fixed-pct sin stopPrice usa fallbackPct=riskPct=0.1 del equity (~1000) -> notional ~100, no 99999.
    const notional = result.trades[0].entryPrice * result.trades[0].quantity;
    expect(notional).toBeGreaterThan(50);
    expect(notional).toBeLessThan(150);
  });

  it('rejects the OPEN (filteredSignals++) when the sizer produces zero size (equity <= 0)', async () => {
    const candles = buildCandles(bullishCloses(60));
    const result = await runBacktest({
      strategy: buildOnceStrategy(10),
      strategyId: 'test-once',
      config: {
        riskProfile: {
          sizer: { type: 'fixed-pct', config: { riskPct: 0.1 } },
        },
      },
      candles,
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 0, // FixedPctSizer.compute() exige equity > 0, si no devuelve quoteQuantity=0
      exchange,
    });
    expect(result.trades).toHaveLength(0);
    expect(result.filteredSignals).toBe(1);
  });
});
