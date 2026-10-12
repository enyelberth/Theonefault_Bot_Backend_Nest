import { RiskManagerService } from './risk-manager.service';
import type { RiskContext } from '../exchanges/domain';

function buildContext(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    accountEquity: 100_000,
    freeMargin: 100_000,
    usedMargin: 0,
    maxDrawdownPct: 100,
    currentDrawdownPct: 0,
    maxPositionSizePct: 100, // sin cap, para aislar el efecto del multiplicador
    maxDailyLossPct: 100,
    dailyPnl: 0,
    openPositionsCount: 0,
    maxOpenPositions: 10,
    killSwitchEnabled: false,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('RiskManagerService.check -- forecastSizeMultiplier', () => {
  const service = new RiskManagerService({} as any);

  it('leaves quoteQuantity/quantity untouched when no multiplier is present', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        quoteQuantity: 1000,
        quantity: 10,
        emittedAt: Date.now(),
      },
      context: buildContext(),
    });
    expect(result.decision.allowed).toBe(true);
    expect(result.adjustedSignal?.quoteQuantity).toBe(1000);
    expect(result.adjustedSignal?.quantity).toBe(10);
  });

  it('scales quoteQuantity/quantity by forecastSizeMultiplier', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        quoteQuantity: 1000,
        quantity: 10,
        emittedAt: Date.now(),
        metadata: { forecastSizeMultiplier: 1.5 },
      },
      context: buildContext(),
    });
    expect(result.decision.allowed).toBe(true);
    expect(result.adjustedSignal?.quoteQuantity).toBe(1500);
    expect(result.adjustedSignal?.quantity).toBe(15);
  });

  it('shrinks size with a multiplier below 1', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        quoteQuantity: 1000,
        quantity: 10,
        emittedAt: Date.now(),
        metadata: { forecastSizeMultiplier: 0.25 },
      },
      context: buildContext(),
    });
    expect(result.adjustedSignal?.quoteQuantity).toBe(250);
    expect(result.adjustedSignal?.quantity).toBe(2.5);
  });

  it('still respects maxPositionSizePct even when the multiplier would push size higher', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        quoteQuantity: 1000,
        quantity: 10,
        emittedAt: Date.now(),
        metadata: { forecastSizeMultiplier: 1.5 }, // -> pediría 1500
      },
      context: buildContext({ accountEquity: 1000, maxPositionSizePct: 100 }), // techo = 1000
    });
    expect(result.decision.allowed).toBe(true);
    expect(result.adjustedSignal?.quoteQuantity).toBe(1000); // clamped por el cap, no por el multiplicador
  });

  it('does not fabricate a quoteQuantity/quantity that the signal never had', async () => {
    const result = await service.check({
      signal: {
        action: 'OPEN',
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 10, // sin quoteQuantity
        emittedAt: Date.now(),
        metadata: { forecastSizeMultiplier: 1.5 },
      },
      context: buildContext(),
    });
    expect(result.adjustedSignal?.quoteQuantity).toBeUndefined();
    expect(result.adjustedSignal?.quantity).toBe(15);
  });
});
