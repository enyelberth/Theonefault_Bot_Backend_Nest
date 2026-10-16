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
  initialQuote: string | null;
  roiPct: number | null;
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
    const realizedPnl = agg._sum.pnl ?? new Prisma.Decimal(0);
    const initialQuote = run.initialQuote ?? null;
    const roiPct = initialQuote && initialQuote.toNumber() > 0
      ? (realizedPnl.toNumber() / initialQuote.toNumber()) * 100
      : null;

    return {
      botRunId: run.id,
      strategyId: run.strategyId,
      symbol: run.symbol,
      strategyType: run.strategyType,
      status: run.status,
      startedAt: run.startedAt,
      realizedPnl: realizedPnl.toString(),
      unrealizedPnl: (
        lastMetric?.unrealizedPnl ?? new Prisma.Decimal(0)
      ).toString(),
      openPositions: lastMetric?.openPositions ?? 0,
      tradesCount,
      winCount: wins,
      lossCount: losses,
      winRate,
      lastPrice: lastMetric?.lastPrice?.toString() ?? null,
      ageSeconds: Math.floor(ageMs / 1000),
      initialQuote: initialQuote?.toString() ?? null,
      roiPct,
    };
  }

  async aggregateBy(dim: 'symbol' | 'strategyType'): Promise<AggregateByKey[]> {
    const runs = await this.prisma.botRun.findMany({
      select: { id: true, symbol: true, strategyType: true },
    });

    const map = new Map<string, { runs: Set<number>; pnl: Prisma.Decimal }>();
    for (const r of runs) {
      const key = (dim === 'symbol' ? r.symbol : r.strategyType) ?? 'unknown';
      if (!map.has(key))
        map.set(key, { runs: new Set(), pnl: new Prisma.Decimal(0) });
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
    results.sort(
      (a, b) => parseFloat(b.realizedPnl) - parseFloat(a.realizedPnl),
    );
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
        bucket = {
          hour: key,
          tradesCount: 0,
          realizedPnl: '0',
          winCount: 0,
          lossCount: 0,
        };
        buckets.set(key, bucket);
      }
      bucket.tradesCount += 1;
      bucket.realizedPnl = new Prisma.Decimal(bucket.realizedPnl)
        .plus(t.pnl)
        .toString();
      const pnlN = new Prisma.Decimal(t.pnl).toNumber();
      if (pnlN > 0) bucket.winCount += 1;
      else bucket.lossCount += 1;
    }

    return Array.from(buckets.values()).sort((a, b) =>
      a.hour.localeCompare(b.hour),
    );
  }

  async getDrawdown(botRunId: number): Promise<DrawdownStats> {
    const run = await this.prisma.botRun.findUnique({
      where: { id: botRunId },
      select: { initialQuote: true },
    });
    const baseline = run?.initialQuote
      ? new Prisma.Decimal(run.initialQuote)
      : new Prisma.Decimal(0);

    const metrics = await this.prisma.botMetric.findMany({
      where: { botRunId },
      orderBy: { ts: 'asc' },
      select: { realizedPnl: true, unrealizedPnl: true },
    });
    if (metrics.length === 0) {
      return {
        botRunId,
        maxEquity: baseline.toString(),
        minEquity: baseline.toString(),
        maxDrawdown: '0',
        maxDrawdownPct: 0,
        sharpe: null,
        points: 0,
      };
    }

    // equity_t = baseline + realizedPnl_t + unrealizedPnl_t
    const equityAt = (m: { realizedPnl: any; unrealizedPnl: any }) =>
      baseline
        .plus(new Prisma.Decimal(m.realizedPnl ?? 0))
        .plus(new Prisma.Decimal(m.unrealizedPnl ?? 0));

    let peak = equityAt(metrics[0]);
    let min = peak;
    let maxDD = new Prisma.Decimal(0);
    let maxDDPct = 0;
    const returns: number[] = [];
    let prev = peak.toNumber();

    for (const m of metrics) {
      const equity = equityAt(m);
      if (equity.greaterThan(peak)) peak = equity;
      if (equity.lessThan(min)) min = equity;
      const dd = peak.minus(equity);
      if (dd.greaterThan(maxDD)) {
        maxDD = dd;
        const peakN = peak.toNumber();
        maxDDPct = peakN === 0 ? 0 : (dd.toNumber() / Math.abs(peakN)) * 100;
      }
      const eqN = equity.toNumber();
      returns.push(eqN - prev);
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

  /**
   * Métricas ricas por estrategia: profit factor, expectancy, avg hold, sharpe.
   */
  async strategyPerformance(): Promise<
    Array<{
      strategyId: string;
      strategyType: string | null;
      symbols: string[];
      trades: number;
      wins: number;
      losses: number;
      winRate: number;
      grossProfit: string;
      grossLoss: string;
      profitFactor: number | null;
      expectancy: string;
      avgWin: string;
      avgLoss: string;
      avgHoldMinutes: number;
      sharpe: number | null;
      realizedPnl: string;
    }>
  > {
    const runs = await this.prisma.botRun.findMany({
      select: { id: true, strategyId: true, strategyType: true, symbol: true },
    });

    const byStrategy = new Map<
      string,
      { runIds: number[]; strategyType: string | null; symbols: Set<string> }
    >();
    for (const r of runs) {
      const b = byStrategy.get(r.strategyId) ?? {
        runIds: [],
        strategyType: r.strategyType,
        symbols: new Set<string>(),
      };
      b.runIds.push(r.id);
      b.symbols.add(r.symbol);
      byStrategy.set(r.strategyId, b);
    }

    const out: Awaited<ReturnType<DashboardService['strategyPerformance']>> =
      [];
    for (const [strategyId, bucket] of byStrategy.entries()) {
      const trades = await this.prisma.tradeResult.findMany({
        where: { botRunId: { in: bucket.runIds } },
        select: { pnl: true, openedAt: true, closedAt: true },
        orderBy: { closedAt: 'asc' },
      });
      if (trades.length === 0) continue;

      let gp = new Prisma.Decimal(0);
      let gl = new Prisma.Decimal(0);
      let wins = 0;
      let losses = 0;
      let holdSum = 0;
      const returns: number[] = [];

      for (const t of trades) {
        const pnl = new Prisma.Decimal(t.pnl);
        const pnlN = pnl.toNumber();
        returns.push(pnlN);
        if (pnl.gt(0)) {
          gp = gp.plus(pnl);
          wins += 1;
        } else {
          gl = gl.plus(pnl.abs());
          losses += 1;
        }
        holdSum += (t.closedAt.getTime() - t.openedAt.getTime()) / 60000;
      }

      const n = trades.length;
      const winRate = (wins / n) * 100;
      const total = gp.minus(gl);
      const avgWin = wins > 0 ? gp.div(wins) : new Prisma.Decimal(0);
      const avgLoss = losses > 0 ? gl.div(losses) : new Prisma.Decimal(0);
      const expectancy = total.div(n);
      const profitFactor = gl.isZero() ? null : gp.div(gl).toNumber();

      let sharpe: number | null = null;
      if (returns.length >= 2) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance =
          returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
        const sd = Math.sqrt(variance);
        sharpe = sd === 0 ? null : (mean / sd) * Math.sqrt(returns.length);
      }

      out.push({
        strategyId,
        strategyType: bucket.strategyType,
        symbols: Array.from(bucket.symbols),
        trades: n,
        wins,
        losses,
        winRate,
        grossProfit: gp.toString(),
        grossLoss: gl.toString(),
        profitFactor,
        expectancy: expectancy.toString(),
        avgWin: avgWin.toString(),
        avgLoss: avgLoss.toString(),
        avgHoldMinutes: holdSum / n,
        sharpe,
        realizedPnl: total.toString(),
      });
    }

    out.sort((a, b) => parseFloat(b.realizedPnl) - parseFloat(a.realizedPnl));
    return out;
  }

  /**
   * Mejores/peores horas del día (0-23) agregando todos los trades.
   */
  async bestHoursOfDay(): Promise<
    Array<{
      hour: number;
      trades: number;
      realizedPnl: string;
      winRate: number;
      avgPnl: string;
    }>
  > {
    const trades = await this.prisma.tradeResult.findMany({
      select: { closedAt: true, pnl: true },
    });
    const map = new Map<
      number,
      { trades: number; pnl: Prisma.Decimal; wins: number }
    >();
    for (const t of trades) {
      const h = new Date(t.closedAt).getUTCHours();
      const b = map.get(h) ?? {
        trades: 0,
        pnl: new Prisma.Decimal(0),
        wins: 0,
      };
      b.trades += 1;
      b.pnl = b.pnl.plus(t.pnl);
      if (new Prisma.Decimal(t.pnl).gt(0)) b.wins += 1;
      map.set(h, b);
    }
    const out: Array<{
      hour: number;
      trades: number;
      realizedPnl: string;
      winRate: number;
      avgPnl: string;
    }> = [];
    for (let h = 0; h < 24; h++) {
      const b = map.get(h);
      if (!b) {
        out.push({
          hour: h,
          trades: 0,
          realizedPnl: '0',
          winRate: 0,
          avgPnl: '0',
        });
        continue;
      }
      out.push({
        hour: h,
        trades: b.trades,
        realizedPnl: b.pnl.toString(),
        winRate: b.trades ? (b.wins / b.trades) * 100 : 0,
        avgPnl: b.trades ? b.pnl.div(b.trades).toString() : '0',
      });
    }
    return out;
  }

  /**
   * Correlación de retornos diarios entre símbolos (Pearson).
   */
  async symbolReturnCorrelation(daysBack = 30): Promise<{
    symbols: string[];
    matrix: number[][];
  }> {
    const since = new Date(Date.now() - daysBack * 86400_000);
    const trades = await this.prisma.tradeResult.findMany({
      where: { closedAt: { gte: since } },
      select: { symbol: true, closedAt: true, pnl: true },
    });
    const bySymbol = new Map<string, Map<string, number>>();
    for (const t of trades) {
      const day = t.closedAt.toISOString().slice(0, 10);
      if (!bySymbol.has(t.symbol)) bySymbol.set(t.symbol, new Map());
      const m = bySymbol.get(t.symbol)!;
      m.set(day, (m.get(day) ?? 0) + new Prisma.Decimal(t.pnl).toNumber());
    }
    const symbols = Array.from(bySymbol.keys());
    const days = new Set<string>();
    for (const m of bySymbol.values()) for (const k of m.keys()) days.add(k);
    const daysSorted = Array.from(days).sort();
    const series: Record<string, number[]> = {};
    for (const s of symbols) {
      series[s] = daysSorted.map((d) => bySymbol.get(s)!.get(d) ?? 0);
    }
    const pearson = (a: number[], b: number[]) => {
      const n = a.length;
      const ma = a.reduce((x, y) => x + y, 0) / n;
      const mb = b.reduce((x, y) => x + y, 0) / n;
      let num = 0,
        da = 0,
        db = 0;
      for (let i = 0; i < n; i++) {
        num += (a[i] - ma) * (b[i] - mb);
        da += (a[i] - ma) ** 2;
        db += (b[i] - mb) ** 2;
      }
      const den = Math.sqrt(da * db);
      return den === 0 ? 0 : num / den;
    };
    const matrix: number[][] = symbols.map((s1) =>
      symbols.map((s2) => (s1 === s2 ? 1 : pearson(series[s1], series[s2]))),
    );
    return { symbols, matrix };
  }

  /**
   * MAE/MFE agregado por strategyId — mide cuánto "sufre" cada trade y cuánto
   * profit deja sobre la mesa. Útil para calibrar SL/TP.
   */
  async excursionStats(): Promise<
    Array<{
      strategyId: string;
      trades: number;
      avgMae: string;
      avgMfe: string;
      avgMaePct: number;
      avgMfePct: number;
      edgeRatio: number | null; // MFE/|MAE| — mayor = mejor timing
    }>
  > {
    const runs = await this.prisma.botRun.findMany({
      select: { id: true, strategyId: true },
    });
    const byStrat = new Map<string, number[]>();
    for (const r of runs) {
      const arr = byStrat.get(r.strategyId) ?? [];
      arr.push(r.id);
      byStrat.set(r.strategyId, arr);
    }

    const out: Awaited<ReturnType<DashboardService['excursionStats']>> = [];
    for (const [strategyId, runIds] of byStrat.entries()) {
      const trades = await this.prisma.tradeResult.findMany({
        where: {
          botRunId: { in: runIds },
          mae: { not: null },
          mfe: { not: null },
        },
        select: { mae: true, mfe: true, maePct: true, mfePct: true },
      });
      if (trades.length === 0) continue;
      let mae = 0,
        mfe = 0,
        maePct = 0,
        mfePct = 0;
      for (const t of trades) {
        mae += Number(t.mae ?? 0);
        mfe += Number(t.mfe ?? 0);
        maePct += Number(t.maePct ?? 0);
        mfePct += Number(t.mfePct ?? 0);
      }
      const n = trades.length;
      const avgMae = mae / n;
      const avgMfe = mfe / n;
      out.push({
        strategyId,
        trades: n,
        avgMae: avgMae.toString(),
        avgMfe: avgMfe.toString(),
        avgMaePct: maePct / n,
        avgMfePct: mfePct / n,
        edgeRatio: avgMae === 0 ? null : avgMfe / Math.abs(avgMae),
      });
    }
    out.sort((a, b) => (b.edgeRatio ?? 0) - (a.edgeRatio ?? 0));
    return out;
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
