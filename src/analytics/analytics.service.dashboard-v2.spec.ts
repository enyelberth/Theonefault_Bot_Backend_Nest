import { Prisma } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

function buildRun(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 1,
    runId: 'r1',
    strategyId: 's1',
    symbol: 'BTCUSDT',
    exchangeMode: 'paper',
    status: 'RUNNING',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    initialEquity: new Prisma.Decimal(1000),
    realizedPnl: new Prisma.Decimal(50),
    dailyPnl: new Prisma.Decimal(10),
    ...overrides,
  };
}

function buildPrisma(opts: {
  activeRuns: any[];
  totalRuns: number;
  snapshot?: any;
  tradesCount?: number;
  wins?: number;
  closedTrades?: any[];
}) {
  return {
    botRunnerRun: {
      findMany: jest.fn().mockResolvedValue(opts.activeRuns),
      count: jest.fn().mockResolvedValue(opts.totalRuns),
    },
    botRunnerSnapshot: {
      findFirst: jest.fn().mockResolvedValue(opts.snapshot ?? null),
    },
    botRunnerTrade: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _count: { _all: opts.tradesCount ?? 0 } }),
      count: jest.fn().mockResolvedValue(opts.wins ?? 0),
      findMany: jest.fn().mockResolvedValue(opts.closedTrades ?? []),
    },
  } as any;
}

describe('AnalyticsService.dashboardV2', () => {
  it('returns no bots and zeroed global stats when there are no v2 runs', async () => {
    const prisma = buildPrisma({ activeRuns: [], totalRuns: 0 });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.dashboardV2();

    expect(result.bots).toEqual([]);
    expect(result.global.totalBotRuns).toBe(0);
    expect(result.global.activeBotRuns).toBe(0);
  });

  it('summarizes an active runner using its latest snapshot and trade stats', async () => {
    const run = buildRun();
    const snapshot = {
      equity: new Prisma.Decimal(1200),
      drawdownPct: 3.5,
      openPositions: 1,
    };
    const prisma = buildPrisma({
      activeRuns: [run],
      totalRuns: 3,
      snapshot,
      tradesCount: 10,
      wins: 6,
    });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.dashboardV2();

    expect(result.global.totalBotRuns).toBe(3);
    expect(result.global.activeBotRuns).toBe(1);
    expect(result.bots).toHaveLength(1);
    expect(result.bots[0]).toMatchObject({
      runId: 'r1',
      symbol: 'BTCUSDT',
      equity: 1200,
      drawdownPct: 3.5,
      openPositions: 1,
      realizedPnl: 50,
      dailyPnl: 10,
      tradesCount: 10,
      winRatePct: 60,
    });
  });

  it('falls back to initialEquity when there is no snapshot yet', async () => {
    const run = buildRun();
    const prisma = buildPrisma({ activeRuns: [run], totalRuns: 1, snapshot: null });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.dashboardV2();

    expect(result.bots[0].equity).toBe(1000);
    expect(result.bots[0].drawdownPct).toBe(0);
  });
});
