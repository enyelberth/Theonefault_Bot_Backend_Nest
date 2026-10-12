import type { Candle, Signal } from '../../exchanges/domain';
import type { IStrategy } from '../../strategies/v2/strategy.interface';
import { runBacktest } from './simulator';

function candle(close: number, openTime: number, stepMs: number, open?: number): Candle {
  return {
    symbol: 'BTCUSDT',
    timeframe: '15m',
    openTime,
    closeTime: openTime + stepMs - 1,
    open: open ?? close,
    high: Math.max(open ?? close, close) * 1.0005,
    low: Math.min(open ?? close, close) * 0.9995,
    close,
    volume: 100,
    closed: true,
  };
}

function buildCandles(closes: number[], stepMs = 15 * 60_000): Candle[] {
  return closes.map((close, i) =>
    candle(close, i * stepMs, stepMs, i === 0 ? close : closes[i - 1]),
  );
}

/** Abre OPEN en la barra `openAtBar` y nunca emite CLOSE por su cuenta -- deja que el exit management decida todo. */
function buildOpenOnceStrategy(openAtBar: number, overrides: Partial<Signal> = {}): IStrategy<any> {
  let opened = false;
  let barIndex = -1;
  return {
    metadata: { id: 'open-once', name: 'open-once', version: '1' },
    onCandle(candle) {
      barIndex += 1;
      if (!opened && barIndex === openAtBar) {
        opened = true;
        return {
          action: 'OPEN',
          symbol: 'BTCUSDT',
          side: 'BUY',
          quoteQuantity: 1000,
          emittedAt: candle.closeTime,
          ...overrides,
        };
      }
      return { action: 'HOLD', symbol: 'BTCUSDT', emittedAt: candle.closeTime };
    },
  };
}

const exchange = { id: 'test-exchange' } as any;
const zeroFees = { makerBps: 0, takerBps: 0, slippageBps: 0 };

describe('runBacktest -- trailing stop', () => {
  it('does nothing when riskProfile.trailingStop is not configured (backward compatible)', async () => {
    const closes = [100, 101, 102, 103, 102, 101, 100, 99, 98, 97];
    const result = await runBacktest({
      strategy: buildOpenOnceStrategy(0),
      strategyId: 'open-once',
      config: {},
      candles: buildCandles(closes),
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 10_000,
      exchange,
      fees: zeroFees,
    });
    // Sin trailingStop ni tp-ladder ni CLOSE de la estrategia, la posición
    // sigue abierta hasta el final -> se fuerza un solo trade 'end-of-data'.
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].reason).toBe('end-of-data');
  });

  it('closes the full position at the trailing stop price when price reverses enough', async () => {
    // Sube de 100 a 120 (peak), después revierte fuerte -> el trailing (ATR*mult) debería disparar.
    const up = Array.from({ length: 30 }, (_, i) => 100 + i); // 100..129
    const down = Array.from({ length: 15 }, (_, i) => 129 - (i + 1) * 3); // reversión fuerte
    const closes = [...up, ...down];
    const result = await runBacktest({
      strategy: buildOpenOnceStrategy(0),
      strategyId: 'open-once',
      config: {
        riskProfile: {
          trailingStop: { atrPeriod: 14, atrMultiplier: 2 },
        },
      },
      candles: buildCandles(closes),
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 10_000,
      exchange,
      fees: zeroFees,
    });

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.reason).toMatch(/^trailingStop@/);
    // El trailing debe cerrar con ganancia (entró en 100, el trailing lo
    // saca durante la reversión pero habiendo capturado buena parte de la subida).
    expect(trade.pnl).toBeGreaterThan(0);
    // No debería llegar hasta el final de la serie (down[-1]=129-45=84): el
    // stop debería dispararse antes de perder toda la ganancia acumulada.
    expect(trade.exitPrice).toBeGreaterThan(84);
  });
});

describe('runBacktest -- tp-ladder', () => {
  it('does nothing when riskProfile.tpLadder is not configured (backward compatible)', async () => {
    const closes = [100, 105, 110, 115, 120];
    const result = await runBacktest({
      strategy: buildOpenOnceStrategy(0),
      strategyId: 'open-once',
      config: {},
      candles: buildCandles(closes),
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 10_000,
      exchange,
      fees: zeroFees,
    });
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].reason).toBe('end-of-data');
  });

  it('records exactly one trade for the whole position lifecycle, with the correct blended pnl across partial fills', async () => {
    // Entry @100. Niveles: L1 +1% (101) 25%, L2 +2% (102) 50%, L3 +5% (105) 25%.
    const closes = [100, 100.5, 101, 101.5, 102, 103, 104, 105, 106];
    const result = await runBacktest({
      strategy: buildOpenOnceStrategy(0),
      strategyId: 'open-once',
      config: {
        riskProfile: {
          tpLadder: {
            levels: [
              { targetPct: 0.01, sizePct: 0.25 },
              { targetPct: 0.02, sizePct: 0.5 },
              { targetPct: 0.05, sizePct: 0.25 },
            ],
          },
        },
      },
      candles: buildCandles(closes),
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 10_000,
      exchange,
      fees: zeroFees,
    });

    // Un solo SimulatedTrade por toda la vida de la posición -- igual que
    // BotRunnerTrade en vivo (no una fila por nivel).
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.reason).toMatch(/^tpLadder-complete@/);

    // quoteQuantity 1000 @ entry 100 -> quantity = 10.
    // L1: 2.5u @101 -> pnl 2.5; L2: 5u @102 -> pnl 10; L3 (resto, 2.5u) @105 -> pnl 12.5
    const correctPnl = 2.5 + 10 + 12.5; // 25
    const buggyOldPnl = (105 - 100) * 10; // 50 -- lo que daría el bug viejo
    expect(trade.pnl).toBeCloseTo(correctPnl, 1);
    expect(trade.pnl).toBeLessThan(buggyOldPnl);
    expect(trade.quantity).toBeCloseTo(10, 6); // reporta la cantidad ORIGINAL completa
  });

  it('never exceeds the original position size even after several partial fills', async () => {
    const closes = [100, 100.5, 101, 101.5, 102, 103, 104, 105, 106];
    const result = await runBacktest({
      strategy: buildOpenOnceStrategy(0),
      strategyId: 'open-once',
      config: {
        riskProfile: {
          tpLadder: {
            levels: [
              { targetPct: 0.01, sizePct: 0.25 },
              { targetPct: 0.02, sizePct: 0.5 },
              { targetPct: 0.05, sizePct: 0.25 },
            ],
          },
        },
      },
      candles: buildCandles(closes),
      symbol: 'BTCUSDT',
      timeframe: '15m',
      initialQuote: 10_000,
      exchange,
      fees: zeroFees,
    });
    expect(result.trades[0].quantity).toBeLessThanOrEqual(10.000001);
  });
});
