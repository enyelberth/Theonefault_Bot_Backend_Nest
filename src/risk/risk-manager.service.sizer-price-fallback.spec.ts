import { RiskManagerService } from './risk-manager.service';
import type { RiskContext, Candle } from '../exchanges/domain';

function buildContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    accountEquity: 10_000,
    freeMargin: 10_000,
    usedMargin: 0,
    maxDrawdownPct: 100,
    currentDrawdownPct: 0,
    maxPositionSizePct: 100,
    maxDailyLossPct: 100,
    dailyPnl: 0,
    openPositionsCount: 0,
    maxOpenPositions: 10,
    killSwitchEnabled: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

function buildHistory(lastClose: number): Candle[] {
  return [
    {
      symbol: 'BTCUSDT',
      timeframe: '15m',
      openTime: 0,
      closeTime: 1,
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
      volume: 1,
      closed: true,
    },
  ];
}

describe('RiskManagerService.check -- sizer price fallback (MARKET signals have no signal.price)', () => {
  const service = new RiskManagerService({} as any);

  it('does NOT reject a MARKET OPEN signal with a sizer configured and no signal.price', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quoteQuantity: 500, // lo que pidió la estrategia -- el sizer lo va a ignorar/recalcular
        emittedAt: Date.now(),
        // sin .price -- este es el caso real de una orden MARKET
      },
      context: buildContext(),
      history: buildHistory(100),
      profile: {
        sizer: { type: 'fixed-pct', config: { riskPct: 0.1 } },
      } as any,
    });

    expect(result.decision.allowed).toBe(true);
    // fixed-pct sin stopPrice -> fallbackPct=riskPct=0.1 del equity (10000) = 1000
    expect(result.adjustedSignal?.quoteQuantity).toBeCloseTo(1000, 0);
  });

  it('uses the last candle close from history as the reference price for the sizer', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quoteQuantity: 500,
        stopLossPrice: 95, // con stopPrice, fixed-pct necesita price real para perUnitRisk
        emittedAt: Date.now(),
      },
      context: buildContext(),
      history: buildHistory(100),
      profile: {
        sizer: { type: 'fixed-pct', config: { riskPct: 0.02 } },
      } as any,
    });

    expect(result.decision.allowed).toBe(true);
    // perUnitRisk = |100-95| = 5; capitalAtRisk = 10000*0.02 = 200; quantity = 200/5 = 40; quoteQuantity = 40*100 = 4000
    expect(result.adjustedSignal?.quantity).toBeCloseTo(40, 4);
    expect(result.adjustedSignal?.quoteQuantity).toBeCloseTo(4000, 2);
  });

  it('still prefers signal.price over history when a LIMIT order does specify one', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        price: 50, // muy distinto al close de history (100) -- debe ganar este
        quoteQuantity: 500,
        emittedAt: Date.now(),
      },
      context: buildContext(),
      history: buildHistory(100),
      profile: {
        sizer: { type: 'fixed-pct', config: { riskPct: 0.1 } },
      } as any,
    });

    expect(result.decision.allowed).toBe(true);
    // fallbackPct 0.1 de 10000 = 1000 notional, a price=50 -> quantity=20
    expect(result.adjustedSignal?.quantity).toBeCloseTo(20, 4);
  });

  it('falls back to 0 (and the pre-existing zero-size rejection) when there is no price anywhere', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quoteQuantity: 500,
        emittedAt: Date.now(),
      },
      context: buildContext(),
      history: [], // sin historial -- no hay de dónde sacar un precio de referencia
      profile: {
        sizer: { type: 'fixed-pct', config: { riskPct: 0.1 } },
      } as any,
    });

    expect(result.decision.allowed).toBe(false);
    if (!result.decision.allowed) {
      expect(result.decision.code).toBe('INVALID_SIGNAL');
    }
  });
});
