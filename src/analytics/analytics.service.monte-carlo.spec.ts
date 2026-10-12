import { Prisma } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

function buildTrade(id: number, pnl: number) {
  return {
    id,
    symbol: 'BTCUSDT',
    side: 'BUY',
    entryPrice: new Prisma.Decimal(100),
    exitPrice: new Prisma.Decimal(100 + pnl),
    quantity: new Prisma.Decimal(1),
    pnl: new Prisma.Decimal(pnl),
    pnlPct: new Prisma.Decimal(pnl),
    fee: new Prisma.Decimal(0.1),
    mae: null,
    mfe: null,
    initialRisk: null,
    rMultiple: null,
    openedAt: new Date('2026-01-01T00:00:00.000Z'),
    closedAt: new Date('2026-01-01T01:00:00.000Z'),
    reason: null,
    marketRegime: null,
    botRunnerRun: { runId: 'r1', strategyId: 's1', exchangeMode: 'paper' },
  };
}

function buildPrisma(opts: {
  trades: ReturnType<typeof buildTrade>[];
  riskProfileId?: number;
  maxDrawdownPct?: number;
}) {
  return {
    botRunnerRun: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 1,
          runId: 'r1',
          symbol: 'BTCUSDT',
          initialEquity: new Prisma.Decimal(1000),
        },
      ]),
      findUnique: jest.fn().mockResolvedValue(
        opts.riskProfileId ? { riskProfileId: opts.riskProfileId } : { riskProfileId: null },
      ),
    },
    botRunnerTrade: { findMany: jest.fn().mockResolvedValue(opts.trades) },
    riskProfile: {
      findUnique: jest.fn().mockResolvedValue(
        opts.maxDrawdownPct !== undefined ? { maxDrawdownPct: opts.maxDrawdownPct } : null,
      ),
    },
  } as any;
}

describe('AnalyticsService.monteCarlo', () => {
  it('returns INSUFFICIENT_DATA below the minimum trade count', async () => {
    const prisma = buildPrisma({ trades: [buildTrade(1, 10)] });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.monteCarlo({});

    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('runs the simulation from historical PnL and surfaces the RiskProfile drawdown threshold', async () => {
    const trades = Array.from({ length: 25 }, (_, i) => buildTrade(i, i % 2 === 0 ? 10 : -5));
    const prisma = buildPrisma({ trades, riskProfileId: 7, maxDrawdownPct: 20 });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.monteCarlo(
      { runId: 'r1' },
      { simulations: 100, horizonTrades: 10 },
    );

    expect(result.status).toBe('OK');
    if (result.status !== 'OK') throw new Error('unreachable');
    expect(result.maxDrawdownPctThreshold).toBe(20);
    expect(result.tradesSampled).toBe(25);
    expect(result.simulations).toBe(100);
  });

  it('rejects an out-of-range simulations count', async () => {
    const prisma = buildPrisma({ trades: [] });
    const service = new AnalyticsService(prisma, {} as any);

    await expect(service.monteCarlo({}, { simulations: 10 })).rejects.toThrow();
  });
});
