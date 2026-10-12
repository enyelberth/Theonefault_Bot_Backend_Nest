import { Prisma } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

function buildPrisma(overrides: {
  runs?: any[];
  trades?: any[];
  priorAgg?: any[];
  events?: any[];
}) {
  return {
    botRunnerRun: {
      findMany: jest.fn().mockResolvedValue(overrides.runs ?? []),
    },
    botRunnerTrade: {
      findMany: jest.fn().mockResolvedValue(overrides.trades ?? []),
    },
    capitalEvent: {
      groupBy: jest.fn().mockResolvedValue(overrides.priorAgg ?? []),
      findMany: jest.fn().mockResolvedValue(overrides.events ?? []),
    },
  } as any;
}

describe('AnalyticsService.statement', () => {
  it('returns an empty statement when no runs match the filters', async () => {
    const prisma = buildPrisma({ runs: [] });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.statement({});

    expect(result.byCurrency).toEqual([]);
    expect(result.trades).toEqual([]);
    expect(result.totals).toBeNull();
  });

  it('computes opening/closing balance per currency from initialEquity + CapitalEvent, and per-trade gross/net/fee', async () => {
    const prisma = buildPrisma({
      runs: [
        { id: 1, runId: 'r1', symbol: 'BTCUSDT', initialEquity: new Prisma.Decimal(1000) },
      ],
      trades: [
        {
          id: 10,
          symbol: 'BTCUSDT',
          side: 'BUY',
          entryPrice: new Prisma.Decimal(100),
          exitPrice: new Prisma.Decimal(102),
          quantity: new Prisma.Decimal(24),
          pnl: new Prisma.Decimal(46), // neto post-fee
          pnlPct: new Prisma.Decimal(1.9),
          fee: new Prisma.Decimal(2),
          mae: null,
          mfe: null,
          initialRisk: null,
          rMultiple: null,
          openedAt: new Date('2026-01-01T00:00:00.000Z'),
          closedAt: new Date('2026-01-01T01:00:00.000Z'),
          reason: 'TP',
          marketRegime: null,
          botRunnerRun: { runId: 'r1', strategyId: 's1', exchangeMode: 'paper' },
        },
      ],
      events: [
        {
          id: 1,
          type: 'TRADE_PNL',
          amount: new Prisma.Decimal(48), // bruto: pnl neto (46) + fee (2)
          currency: 'USDT',
          botRunnerRunId: 1,
          tradeId: 10,
          correlationId: 'c1',
          source: 'binance',
          occurredAt: new Date('2026-01-01T01:00:00.000Z'),
        },
        {
          id: 2,
          type: 'FEE',
          amount: new Prisma.Decimal(-2),
          currency: 'USDT',
          botRunnerRunId: 1,
          tradeId: 10,
          correlationId: 'c1',
          source: 'binance',
          occurredAt: new Date('2026-01-01T01:00:00.000Z'),
        },
      ],
    });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.statement({});

    expect(result.byCurrency).toEqual([
      { currency: 'USDT', openingBalance: 1000, closingBalance: 1046, netChange: 46 },
    ]);
    expect(result.totals?.netPnl).toBe(46);
    expect(result.totals?.totalFees).toBe(2);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      tradeId: 10,
      grossPnl: 48,
      fee: 2,
      netPnl: 46,
    });
    expect(result.capitalEvents).toHaveLength(2);
    expect(result.capitalEvents[0].runningBalance).toBe(1048);
    expect(result.capitalEvents[1].runningBalance).toBe(1046);
  });

  it('carries forward balance from before the "from" filter instead of resetting to initialEquity', async () => {
    const prisma = buildPrisma({
      runs: [
        { id: 1, runId: 'r1', symbol: 'ETHUSDT', initialEquity: new Prisma.Decimal(500) },
      ],
      trades: [],
      priorAgg: [{ currency: 'USDT', _sum: { amount: new Prisma.Decimal(30) } }],
      events: [],
    });
    const service = new AnalyticsService(prisma, {} as any);

    const result = await service.statement({ from: new Date('2026-02-01T00:00:00.000Z') });

    expect(result.byCurrency).toEqual([
      { currency: 'USDT', openingBalance: 530, closingBalance: 530, netChange: 0 },
    ]);
  });
});
