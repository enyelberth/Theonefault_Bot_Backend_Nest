import { Injectable, Logger } from '@nestjs/common';
import { BotRun, BotRunStatus, Prisma, PrismaClient } from '@prisma/client';

export interface BotLiveSummary {
  botRunId: number;
  strategyId: string;
  symbol: string;
  strategyType: string | null;
  status: BotRunStatus;
  startedAt: Date;
  realizedPnl: string;
  unrealizedPnl: string;
  openPositions: number;
  tradesCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  lastPrice: string | null;
  ageSeconds: number;
}

export interface AggregateByKey {
  key: string;
  botRuns: number;
  realizedPnl: string;
  tradesCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

export interface HourBucket {
  hour: string; // ISO truncado
  tradesCount: number;
  realizedPnl: string;
  winCount: number;
  lossCount: number;
}

export interface DrawdownStats {
  botRunId: number;
  maxEquity: string;
  minEquity: string;
  maxDrawdown: string;
  maxDrawdownPct: number;
  sharpe: number | null;
  points: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async getActiveBotSummaries(): Promise<BotLiveSummary[]> {
    const runs = await this.prisma.botRun.findMany({
      where: { status: BotRunStatus.RUNNING },
      orderBy: { startedAt: 'desc' },
    });
    return Promise.all(runs.map((r) => this.summarizeRun(r)));
  }

  async summarizeRun(run: BotRun): Promise<BotLiveSummary> {
    const [agg, wins, losses, lastMetric] = await Promise.all([
      this.prisma.tradeResult.aggregate({
        where: { botRunId: run.id },
        _sum: { pnl: true },
        _count: { _all: true },
      }),
      this.prisma.tradeResult.count({
        where: { botRunId: run.id, pnl: { gt: 0 } },
      }),
      this.prisma.tradeResult.count({
        where: { botRunId: run.id, pnl: { lte: 0 } },
      }),
      this.prisma.botMetric.findFirst({
        where: { botRunId: run.id },
        orderBy: { ts: 'desc' },
      }),
    ]);

    const tradesCount = agg._count._all;
    const winRate = tradesCount === 0 ? 0 : (wins / tradesCount) * 100;
    const ageMs = Date.now() - run.startedAt.getTime();

    return {
      botRunId: run.id,
      strategyId: run.strategyId,
      symbol: run.symbol,
      strategyType: run.strategyType,
      status: run.status,
      startedAt: run.startedAt,
      realizedPnl: (agg._sum.pnl ?? new Prisma.Decimal(0)).toString(),
      unrealizedPnl: (lastMetric?.unrealizedPnl ?? new Prisma.Decimal(0)).toString(),
      openPositions: lastMetric?.openPositions ?? 0,
      tradesCount,
      winCount: wins,
      lossCount: losses,
      winRate,
      lastPrice: lastMetric?.lastPrice?.toString() ?? null,
      ageSeconds: Math.floor(ageMs / 1000),
    };
  }

  async aggregateBy(
    dim: 'symbol' | 'strategyType',
  ): Promise<AggregateByKey[]> {
    const runs = await this.prisma.botRun.findMany({
      select: { id: true, symbol: true, strategyType: true },
    });

    const map = new Map<string, { runs: Set<number>; pnl: Prisma.Decimal }>();
    for (const r of runs) {
      const key = (dim === 'symbol' ? r.symbol : r.strategyType) ?? 'unknown';
      if (!map.has(key)) map.set(key, { runs: new Set(), pnl: new Prisma.Decimal(0) });
      map.get(key)!.runs.add(r.id);
    }

    const results: AggregateByKey[] = [];
    for (const [key, bucket] of map.entries()) {
      const runIds = Array.from(bucket.runs);
      const [agg, wins, losses] = await Promise.all([
        this.prisma.tradeResult.aggregate({
          where: { botRunId: { in: runIds } },
          _sum: { pnl: true },
          _count: { _all: true },
        }),
        this.prisma.tradeResult.count({
          where: { botRunId: { in: runIds }, pnl: { gt: 0 } },
        }),
        this.prisma.tradeResult.count({
          where: { botRunId: { in: runIds }, pnl: { lte: 0 } },
        }),
      ]);
      const total = agg._count._all;
      results.push({
        key,
        botRuns: runIds.length,
        realizedPnl: (agg._sum.pnl ?? new Prisma.Decimal(0)).toString(),
        tradesCount: total,
        winCount: wins,
        lossCount: losses,
        winRate: total === 0 ? 0 : (wins / total) * 100,
      });
    }
    results.sort((a, b) => parseFloat(b.realizedPnl) - parseFloat(a.realizedPnl));
    return results;
  }

  async aggregateByHour(hoursBack = 24): Promise<HourBucket[]> {
    const since = new Date(Date.now() - hoursBack * 3600 * 1000);
    const trades = await this.prisma.tradeResult.findMany({
      where: { closedAt: { gte: since } },
      select: { closedAt: true, pnl: true },
    });

    const buckets = new Map<string, HourBucket>();
    for (const t of trades) {
      const d = new Date(t.closedAt);
      d.setMinutes(0, 0, 0);
      const key = d.toISOString();
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { hour: key, tradesCount: 0, realizedPnl: '0', winCount: 0, lossCount: 0 };
        buckets.set(key, bucket);
      }
      bucket.tradesCount += 1;
      bucket.realizedPnl = new Prisma.Decimal(bucket.realizedPnl).plus(t.pnl).toString();
      const pnlN = new Prisma.Decimal(t.pnl).toNumber();
      if (pnlN > 0) bucket.winCount += 1;
      else bucket.lossCount += 1;
    }

    return Array.from(buckets.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }

  async getDrawdown(botRunId: number): Promise<DrawdownStats> {
    const metrics = await this.prisma.botMetric.findMany({
      where: { botRunId },
      orderBy: { ts: 'asc' },
      select: { realizedPnl: true },
    });
    if (metrics.length === 0) {
      return {
        botRunId,
        maxEquity: '0',
        minEquity: '0',
        maxDrawdown: '0',
        maxDrawdownPct: 0,
        sharpe: null,
        points: 0,
      };
    }

    let peak = new Prisma.Decimal(metrics[0].realizedPnl);
    let maxDD = new Prisma.Decimal(0);
    let maxDDPct = 0;
    let min = peak;

    const returns: number[] = [];
    let prev = peak.toNumber();

    for (const m of metrics) {
      const equity = new Prisma.Decimal(m.realizedPnl);
      if (equity.greaterThan(peak)) peak = equity;
      if (equity.lessThan(min)) min = equity;
      const dd = peak.minus(equity);
      if (dd.greaterThan(maxDD)) {
        maxDD = dd;
        const peakN = peak.toNumber();
        maxDDPct = peakN === 0 ? 0 : (dd.toNumber() / Math.abs(peakN)) * 100;
      }
      const eqN = equity.toNumber();
      if (returns.length || prev !== undefined) returns.push(eqN - prev);
      prev = eqN;
    }

    let sharpe: number | null = null;
    if (returns.length >= 2) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance =
        returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
      const sd = Math.sqrt(variance);
      sharpe = sd === 0 ? null : (mean / sd) * Math.sqrt(returns.length);
    }

    return {
      botRunId,
      maxEquity: peak.toString(),
      minEquity: min.toString(),
      maxDrawdown: maxDD.toString(),
      maxDrawdownPct: maxDDPct,
      sharpe,
      points: metrics.length,
    };
  }

  async getGlobalStats() {
    const [runs, totalTrades, agg, wins] = await Promise.all([
      this.prisma.botRun.count(),
      this.prisma.tradeResult.count(),
      this.prisma.tradeResult.aggregate({ _sum: { pnl: true } }),
      this.prisma.tradeResult.count({ where: { pnl: { gt: 0 } } }),
    ]);
    const activeRuns = await this.prisma.botRun.count({
      where: { status: BotRunStatus.RUNNING },
    });
    return {
      totalBotRuns: runs,
      activeBotRuns: activeRuns,
      totalTrades,
      realizedPnl: (agg._sum.pnl ?? new Prisma.Decimal(0)).toString(),
      winRate: totalTrades === 0 ? 0 : (wins / totalTrades) * 100,
    };
  }
}
