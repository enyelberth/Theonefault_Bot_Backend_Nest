import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CryptoPriceService } from '../crypto-price/crypto-price.service';
import { calculateAnalytics } from './analytics-calculator';
import { calculateExecutionMetrics } from './execution-calculator';
import { simulateEquityPaths } from './monte-carlo.calculator';
import type {
  AnalyticsFilters,
  AnalyticsGroupBy,
  AnalyticsTrade,
  ExecutionSample,
} from './analytics.types';

export interface AnalyticsQuery {
  ownerId?: string;
  runId?: string;
  strategyId?: string;
  symbol?: string;
  mode?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly priceService: CryptoPriceService,
  ) {}

  async openPositions(input: { ownerId?: number }) {
    const runs = await this.prisma.botRunnerRun.findMany({
      where: { ownerId: input.ownerId },
      select: { id: true, runId: true, strategyId: true, exchangeMode: true },
    });
    if (runs.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        positions: [],
        totalUnrealizedPnl: 0,
      };
    }
    const runById = new Map(runs.map((r) => [r.id, r]));
    const trades = await this.prisma.botRunnerTrade.findMany({
      where: { botRunnerRunId: { in: runs.map((r) => r.id) }, closedAt: null },
      orderBy: { openedAt: 'asc' },
    });
    if (trades.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        positions: [],
        totalUnrealizedPnl: 0,
      };
    }
    const uniqueSymbols = Array.from(new Set(trades.map((t) => t.symbol)));
    const priceMap = new Map<string, number | null>();
    await Promise.all(
      uniqueSymbols.map(async (s) => {
        const p = await this.priceService.findOne(s).catch(() => null);
        priceMap.set(s, p);
      }),
    );
    let totalUnrealized = 0;
    const positions = trades.map((t) => {
      const run = runById.get(t.botRunnerRunId);
      const entry = Number(t.entryPrice);
      const qty = Number(t.quantity);
      const entryFee = Number(t.fee);
      const stop = t.stopLossPrice === null ? null : Number(t.stopLossPrice);
      const initialRisk = t.initialRisk === null ? null : Number(t.initialRisk);
      const currentPrice = priceMap.get(t.symbol) ?? null;
      const unrealizedPnl =
        currentPrice === null
          ? null
          : (t.side === 'BUY'
              ? (currentPrice - entry) * qty
              : (entry - currentPrice) * qty) - entryFee;
      if (unrealizedPnl !== null) totalUnrealized += unrealizedPnl;
      const notional = entry * qty;
      const unrealizedPnlPct =
        unrealizedPnl !== null && notional > 0
          ? Number(((unrealizedPnl / notional) * 100).toFixed(4))
          : null;
      const unrealizedR =
        unrealizedPnl !== null && initialRisk !== null && initialRisk > 0
          ? Number((unrealizedPnl / initialRisk).toFixed(4))
          : null;
      const peak = t.peakPrice === null ? entry : Number(t.peakPrice);
      const trough = t.troughPrice === null ? entry : Number(t.troughPrice);
      const currentMae =
        t.side === 'BUY' ? (trough - entry) * qty : (entry - peak) * qty;
      const currentMfe =
        t.side === 'BUY' ? (peak - entry) * qty : (entry - trough) * qty;
      const ageMinutes = (Date.now() - t.openedAt.getTime()) / 60_000;
      return {
        tradeId: t.id,
        runId: run?.runId,
        strategyId: run?.strategyId,
        mode: run?.exchangeMode,
        symbol: t.symbol,
        side: t.side,
        entryPrice: entry,
        quantity: qty,
        stopLossPrice: stop,
        initialRisk,
        currentPrice,
        notional: Number(notional.toFixed(8)),
        unrealizedPnl:
          unrealizedPnl === null ? null : Number(unrealizedPnl.toFixed(8)),
        unrealizedPnlPct,
        unrealizedR,
        currentMae: Number(currentMae.toFixed(8)),
        currentMfe: Number(currentMfe.toFixed(8)),
        openedAt: t.openedAt.toISOString(),
        ageMinutes: Number(ageMinutes.toFixed(1)),
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      totalUnrealizedPnl: Number(totalUnrealized.toFixed(8)),
      positions,
    };
  }

  async timeOfDay(filters: AnalyticsFilters, groupBy?: 'symbol' | 'strategy') {
    const trades = (await this.loadDataset(filters)).trades;
    const globalHours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      trades: 0,
      wins: 0,
      netPnl: 0,
    }));
    const groups = new Map<string, ReturnType<typeof this.emptyHours>>();
    for (const t of trades) {
      const h = t.closedAt.getUTCHours();
      const g = globalHours[h];
      g.trades += 1;
      if (t.pnl > 0) g.wins += 1;
      g.netPnl += t.pnl;
      if (groupBy) {
        const key = groupBy === 'symbol' ? t.symbol : t.strategyId;
        const bucket = groups.get(key) ?? this.emptyHours();
        const row = bucket[h];
        row.trades += 1;
        if (t.pnl > 0) row.wins += 1;
        row.netPnl += t.pnl;
        groups.set(key, bucket);
      }
    }
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      groupBy: groupBy ?? null,
      global: globalHours.map((h) => ({
        hour: h.hour,
        trades: h.trades,
        winRatePct:
          h.trades > 0 ? Number(((h.wins / h.trades) * 100).toFixed(2)) : 0,
        netPnl: Number(h.netPnl.toFixed(8)),
        expectancy: h.trades > 0 ? Number((h.netPnl / h.trades).toFixed(8)) : 0,
      })),
      groups: groupBy
        ? Array.from(groups.entries())
            .map(([key, rows]) => ({
              key,
              hours: rows.map((h) => ({
                hour: h.hour,
                trades: h.trades,
                winRatePct:
                  h.trades > 0
                    ? Number(((h.wins / h.trades) * 100).toFixed(2))
                    : 0,
                netPnl: Number(h.netPnl.toFixed(8)),
              })),
              totalTrades: rows.reduce((s, r) => s + r.trades, 0),
              totalNetPnl: Number(
                rows.reduce((s, r) => s + r.netPnl, 0).toFixed(8),
              ),
            }))
            .sort((a, b) => b.totalNetPnl - a.totalNetPnl)
        : null,
    };
  }

  async dayOfWeek(filters: AnalyticsFilters) {
    const trades = (await this.loadDataset(filters)).trades;
    const days = Array.from({ length: 7 }, (_, i) => ({
      dayIndex: i,
      dayName: ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'][i],
      trades: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
      fees: 0,
    }));
    for (const t of trades) {
      const d = t.closedAt.getUTCDay();
      const b = days[d];
      b.trades += 1;
      if (t.pnl > 0) b.wins += 1;
      else if (t.pnl < 0) b.losses += 1;
      b.netPnl += t.pnl;
      b.fees += t.fees;
    }
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      days: days.map((d) => ({
        dayIndex: d.dayIndex,
        dayName: d.dayName,
        trades: d.trades,
        wins: d.wins,
        losses: d.losses,
        winRatePct:
          d.trades > 0 ? Number(((d.wins / d.trades) * 100).toFixed(2)) : 0,
        netPnl: Number(d.netPnl.toFixed(8)),
        fees: Number(d.fees.toFixed(8)),
        expectancy: d.trades > 0 ? Number((d.netPnl / d.trades).toFixed(8)) : 0,
      })),
    };
  }

  private emptyHours() {
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      trades: 0,
      wins: 0,
      netPnl: 0,
    }));
  }

  async sizingHistory(input: { runId?: string; limit?: number }) {
    const runFilter = input.runId
      ? await this.prisma.botRunnerRun.findUnique({
          where: { runId: input.runId },
          select: { id: true },
        })
      : null;
    if (input.runId && !runFilter) {
      return {
        generatedAt: new Date().toISOString(),
        entries: [],
        distribution: { min: 0, max: 0, average: 0, median: 0 },
      };
    }
    const traces = await this.prisma.botRunnerTrace.findMany({
      where: {
        botRunnerRunId: runFilter?.id,
        eventType: { in: ['RISK_ALLOWED', 'RISK_ADJUSTED'] },
      },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(input.limit ?? 200, 1000),
    });
    const entries: Array<{
      occurredAt: string;
      correlationId: string;
      symbol: string;
      sizer: string | null;
      quoteQuantity: number | null;
      notes: string | null;
    }> = [];
    for (const t of traces) {
      const payload = (t.payload as any) ?? {};
      const sizing = payload.sizing ?? {};
      const adjustedSignal = payload.adjustedSignal ?? {};
      const quote =
        typeof sizing.quoteQuantity === 'number'
          ? sizing.quoteQuantity
          : typeof adjustedSignal.quoteQuantity === 'number'
            ? adjustedSignal.quoteQuantity
            : null;
      entries.push({
        occurredAt: t.occurredAt.toISOString(),
        correlationId: t.correlationId,
        symbol: t.symbol,
        sizer: sizing.sizer ?? null,
        quoteQuantity: quote,
        notes: sizing.notes ?? null,
      });
    }
    const values = entries
      .map((e) => e.quoteQuantity)
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .sort((a, b) => a - b);
    const dist =
      values.length > 0
        ? {
            min: values[0],
            max: values[values.length - 1],
            average: values.reduce((s, x) => s + x, 0) / values.length,
            median:
              values.length % 2 === 0
                ? (values[values.length / 2 - 1] + values[values.length / 2]) /
                  2
                : values[Math.floor(values.length / 2)],
          }
        : { min: 0, max: 0, average: 0, median: 0 };
    return {
      generatedAt: new Date().toISOString(),
      entries,
      distribution: {
        min: Number(dist.min.toFixed(8)),
        max: Number(dist.max.toFixed(8)),
        average: Number(dist.average.toFixed(8)),
        median: Number(dist.median.toFixed(8)),
      },
    };
  }

  async holdingTime(filters: AnalyticsFilters) {
    const trades = (await this.loadDataset(filters)).trades;
    const buckets = [
      { key: '<5m', maxMinutes: 5 },
      { key: '5-15m', maxMinutes: 15 },
      { key: '15-60m', maxMinutes: 60 },
      { key: '1-4h', maxMinutes: 240 },
      { key: '4-24h', maxMinutes: 1440 },
      { key: '1-7d', maxMinutes: 10_080 },
      { key: '>7d', maxMinutes: Infinity },
    ].map((b) => ({
      key: b.key,
      maxMinutes: b.maxMinutes,
      trades: 0,
      wins: 0,
      losses: 0,
      netPnl: 0,
      totalRisk: 0,
      totalR: 0,
      tradesWithRisk: 0,
    }));
    const minutesBucket = (m: number) =>
      buckets.find((b) => m <= b.maxMinutes)!;
    let durationSum = 0;
    for (const t of trades) {
      const minutes = (t.closedAt.getTime() - t.openedAt.getTime()) / 60_000;
      durationSum += minutes;
      const b = minutesBucket(minutes);
      b.trades += 1;
      if (t.pnl > 0) b.wins += 1;
      else if (t.pnl < 0) b.losses += 1;
      b.netPnl += t.pnl;
      const r =
        t.rMultiple !== null
          ? t.rMultiple
          : t.initialRisk !== null && t.initialRisk > 0
            ? t.pnl / t.initialRisk
            : null;
      if (r !== null) {
        b.totalR += r;
        b.tradesWithRisk += 1;
      }
    }
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      averageHoldingMinutes:
        trades.length > 0
          ? Number((durationSum / trades.length).toFixed(2))
          : 0,
      buckets: buckets.map((b) => ({
        key: b.key,
        trades: b.trades,
        wins: b.wins,
        losses: b.losses,
        winRatePct:
          b.trades > 0 ? Number(((b.wins / b.trades) * 100).toFixed(2)) : 0,
        netPnl: Number(b.netPnl.toFixed(8)),
        expectancy: b.trades > 0 ? Number((b.netPnl / b.trades).toFixed(8)) : 0,
        averageR:
          b.tradesWithRisk > 0
            ? Number((b.totalR / b.tradesWithRisk).toFixed(4))
            : null,
      })),
    };
  }

  async rollingMetrics(filters: AnalyticsFilters, window: number) {
    const trades = (await this.loadDataset(filters)).trades;
    if (trades.length < window) {
      return {
        generatedAt: new Date().toISOString(),
        window,
        insufficient: true,
        tradeCount: trades.length,
        points: [],
      };
    }
    const points: Array<{
      tradeId: number;
      closedAt: string;
      winRatePct: number;
      averagePnl: number;
      sharpe: number | null;
      sortino: number | null;
      expectancy: number;
      cumulativeNetPnl: number;
    }> = [];
    let cumulative = 0;
    for (let i = 0; i < trades.length; i++) {
      cumulative += trades[i].pnl;
      if (i + 1 < window) continue;
      const slice = trades.slice(i + 1 - window, i + 1);
      const wins = slice.filter((t) => t.pnl > 0).length;
      const returns = slice.flatMap((t) => {
        const notional = t.entryPrice * t.quantity;
        return notional > 0 ? [t.pnl / notional] : [];
      });
      const avg =
        returns.length > 0
          ? returns.reduce((s, x) => s + x, 0) / returns.length
          : 0;
      const variance =
        returns.length > 1
          ? returns.reduce((s, x) => s + (x - avg) ** 2, 0) /
            (returns.length - 1)
          : 0;
      const sd = Math.sqrt(variance);
      const downside = returns.filter((x) => x < 0);
      const dd =
        downside.length > 0
          ? Math.sqrt(downside.reduce((s, x) => s + x * x, 0) / downside.length)
          : 0;
      const scale = Math.sqrt(Math.max(returns.length, 1));
      const sumPnl = slice.reduce((s, t) => s + t.pnl, 0);
      points.push({
        tradeId: trades[i].id,
        closedAt: trades[i].closedAt.toISOString(),
        winRatePct: Number(((wins / slice.length) * 100).toFixed(2)),
        averagePnl: Number((sumPnl / slice.length).toFixed(8)),
        expectancy: Number((sumPnl / slice.length).toFixed(8)),
        sharpe: sd > 0 ? Number(((avg / sd) * scale).toFixed(4)) : null,
        sortino: dd > 0 ? Number(((avg / dd) * scale).toFixed(4)) : null,
        cumulativeNetPnl: Number(cumulative.toFixed(8)),
      });
    }
    return {
      generatedAt: new Date().toISOString(),
      window,
      tradeCount: trades.length,
      points,
    };
  }

  async drawdownRecovery(filters: AnalyticsFilters) {
    const trades = (await this.loadDataset(filters)).trades;
    if (trades.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        drawdowns: [],
        currentUnderwater: null,
        streaks: { longestWin: 0, longestLoss: 0, distribution: [] },
      };
    }
    let equity = 0;
    let peak = 0;
    let peakAt: Date = trades[0].openedAt;
    let inDrawdown = false;
    let troughEquity = 0;
    let troughAt: Date = trades[0].openedAt;
    let underwaterTrades = 0;
    const drawdowns: Array<{
      startedAt: string;
      troughAt: string;
      recoveredAt: string | null;
      peakEquity: number;
      troughEquity: number;
      drawdown: number;
      drawdownPct: number;
      recoveryMinutes: number | null;
      tradesUnderwater: number;
    }> = [];
    for (const t of trades) {
      equity += t.pnl;
      if (equity >= peak) {
        if (inDrawdown) {
          const dd = peak - troughEquity;
          const recoveryMs = t.closedAt.getTime() - troughAt.getTime();
          drawdowns.push({
            startedAt: peakAt.toISOString(),
            troughAt: troughAt.toISOString(),
            recoveredAt: t.closedAt.toISOString(),
            peakEquity: Number(peak.toFixed(8)),
            troughEquity: Number(troughEquity.toFixed(8)),
            drawdown: Number(dd.toFixed(8)),
            drawdownPct:
              peak !== 0 ? Number(((dd / Math.abs(peak)) * 100).toFixed(4)) : 0,
            recoveryMinutes: Number((recoveryMs / 60_000).toFixed(2)),
            tradesUnderwater: underwaterTrades,
          });
          inDrawdown = false;
          underwaterTrades = 0;
        }
        peak = equity;
        peakAt = t.closedAt;
      } else {
        if (!inDrawdown) {
          inDrawdown = true;
          troughEquity = equity;
          troughAt = t.closedAt;
          underwaterTrades = 1;
        } else {
          underwaterTrades += 1;
          if (equity < troughEquity) {
            troughEquity = equity;
            troughAt = t.closedAt;
          }
        }
      }
    }
    const currentUnderwater = inDrawdown
      ? {
          startedAt: peakAt.toISOString(),
          troughAt: troughAt.toISOString(),
          peakEquity: Number(peak.toFixed(8)),
          currentEquity: Number(equity.toFixed(8)),
          drawdown: Number((peak - equity).toFixed(8)),
          drawdownPct:
            peak !== 0
              ? Number((((peak - equity) / Math.abs(peak)) * 100).toFixed(4))
              : 0,
          tradesUnderwater: underwaterTrades,
          minutesUnderwater: Number(
            ((Date.now() - troughAt.getTime()) / 60_000).toFixed(2),
          ),
        }
      : null;
    const winStreakLengths: number[] = [];
    const lossStreakLengths: number[] = [];
    let curWin = 0;
    let curLoss = 0;
    for (const t of trades) {
      if (t.pnl > 0) {
        curWin += 1;
        if (curLoss > 0) {
          lossStreakLengths.push(curLoss);
          curLoss = 0;
        }
      } else if (t.pnl < 0) {
        curLoss += 1;
        if (curWin > 0) {
          winStreakLengths.push(curWin);
          curWin = 0;
        }
      }
    }
    if (curWin > 0) winStreakLengths.push(curWin);
    if (curLoss > 0) lossStreakLengths.push(curLoss);
    const distribution = (arr: number[]) => {
      const map = new Map<number, number>();
      for (const n of arr) map.set(n, (map.get(n) ?? 0) + 1);
      return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([length, count]) => ({ length, count }));
    };
    return {
      generatedAt: new Date().toISOString(),
      drawdowns,
      currentUnderwater,
      streaks: {
        longestWin: Math.max(0, ...winStreakLengths),
        longestLoss: Math.max(0, ...lossStreakLengths),
        winDistribution: distribution(winStreakLengths),
        lossDistribution: distribution(lossStreakLengths),
      },
    };
  }

  async attribution(
    filters: AnalyticsFilters,
    groupBy?: 'symbol' | 'strategy' | 'run',
  ) {
    const dataset = await this.loadDataset(filters);
    const executionSamples = await this.loadExecutionSamples(filters);
    const bucket = (key: string) => ({
      key,
      trades: 0,
      grossPnl: 0,
      fees: 0,
      slippageCost: 0,
      slippageAttempts: 0,
    });
    const groupKey = (row: {
      symbol: string;
      strategyId: string;
      runId: string;
    }) =>
      groupBy === 'strategy'
        ? row.strategyId
        : groupBy === 'run'
          ? row.runId
          : row.symbol;
    const groups = new Map<string, ReturnType<typeof bucket>>();
    const ensure = (key: string) => {
      const b = groups.get(key) ?? bucket(key);
      groups.set(key, b);
      return b;
    };
    for (const t of dataset.trades) {
      const b = groupBy ? ensure(groupKey(t)) : ensure('ALL');
      b.trades += 1;
      b.grossPnl += t.pnl + t.fees;
      b.fees += t.fees;
    }
    for (const s of executionSamples) {
      if (s.slippageQuote === null) continue;
      const b = groupBy ? ensure(groupKey(s)) : ensure('ALL');
      b.slippageCost += s.slippageQuote;
      b.slippageAttempts += 1;
    }
    const rows = Array.from(groups.values()).map((b) => {
      const idealPnl = b.grossPnl + b.slippageCost;
      const friction = b.fees + b.slippageCost;
      const netEconomic = b.grossPnl - b.fees;
      const frictionPct =
        Math.abs(idealPnl) > 0
          ? Number(((friction / Math.abs(idealPnl)) * 100).toFixed(4))
          : null;
      return {
        key: b.key,
        trades: b.trades,
        grossPnl: Number(b.grossPnl.toFixed(8)),
        fees: Number(b.fees.toFixed(8)),
        slippageCost: Number(b.slippageCost.toFixed(8)),
        slippageAttempts: b.slippageAttempts,
        idealPnl: Number(idealPnl.toFixed(8)),
        netEconomic: Number(netEconomic.toFixed(8)),
        frictionCost: Number(friction.toFixed(8)),
        frictionPctOfIdeal: frictionPct,
      };
    });
    rows.sort((a, b) => Math.abs(b.frictionCost) - Math.abs(a.frictionCost));
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      groupBy: groupBy ?? null,
      groups: rows,
    };
  }

  async feesBreakdown(filters: AnalyticsFilters) {
    const trades = (await this.loadDataset(filters)).trades;
    const bySymbol = new Map<
      string,
      {
        symbol: string;
        trades: number;
        fees: number;
        grossPnl: number;
        notional: number;
      }
    >();
    for (const t of trades) {
      const b = bySymbol.get(t.symbol) ?? {
        symbol: t.symbol,
        trades: 0,
        fees: 0,
        grossPnl: 0,
        notional: 0,
      };
      b.trades += 1;
      b.fees += t.fees;
      b.grossPnl += t.pnl + t.fees;
      b.notional += t.entryPrice * t.quantity;
      bySymbol.set(t.symbol, b);
    }
    const rows = Array.from(bySymbol.values())
      .map((b) => ({
        symbol: b.symbol,
        trades: b.trades,
        totalFees: Number(b.fees.toFixed(8)),
        grossPnl: Number(b.grossPnl.toFixed(8)),
        notional: Number(b.notional.toFixed(8)),
        feeBps:
          b.notional > 0
            ? Number(((b.fees / b.notional) * 10_000).toFixed(4))
            : null,
        feePctOfGross:
          Math.abs(b.grossPnl) > 0
            ? Number(((b.fees / Math.abs(b.grossPnl)) * 100).toFixed(4))
            : null,
      }))
      .sort((a, b) => b.totalFees - a.totalFees);
    const totalFees = rows.reduce((s, r) => s + r.totalFees, 0);
    const totalGross = rows.reduce((s, r) => s + r.grossPnl, 0);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      totals: {
        totalFees: Number(totalFees.toFixed(8)),
        totalGrossPnl: Number(totalGross.toFixed(8)),
        overallFeePctOfGross:
          Math.abs(totalGross) > 0
            ? Number(((totalFees / Math.abs(totalGross)) * 100).toFixed(4))
            : null,
      },
      bySymbol: rows,
    };
  }

  async systemHealth() {
    const now = Date.now();
    const [
      activeRuns,
      unackedCritical,
      unackedTotal,
      lastWalletSync,
      lastReconciliation,
      dbPing,
    ] = await Promise.all([
      this.prisma.botRunnerRun.count({ where: { status: 'RUNNING' } }),
      this.prisma.operationalAlert.count({
        where: { acknowledgedAt: null, severity: 'CRITICAL' },
      }),
      this.prisma.operationalAlert.count({ where: { acknowledgedAt: null } }),
      this.prisma.capitalEvent.findFirst({
        where: { source: 'binance' },
        orderBy: { occurredAt: 'desc' },
        select: { occurredAt: true },
      }),
      this.prisma.reconciliationBatch
        .findFirst({
          orderBy: { startedAt: 'desc' },
          select: { completedAt: true },
        })
        .catch(() => null),
      this.prisma
        .$queryRawUnsafe<Array<{ ok: number }>>('SELECT 1 as ok')
        .then(() => true)
        .catch(() => false),
    ]);
    const walletSyncAgeMinutes = lastWalletSync?.occurredAt
      ? (now - lastWalletSync.occurredAt.getTime()) / 60_000
      : null;
    const reconciliationAgeMinutes = lastReconciliation?.completedAt
      ? (now - lastReconciliation.completedAt.getTime()) / 60_000
      : null;
    return {
      generatedAt: new Date().toISOString(),
      db: dbPing ? 'ok' : 'down',
      activeRuns,
      alerts: { unackedTotal, unackedCritical },
      walletSync: {
        lastAt: lastWalletSync?.occurredAt?.toISOString() ?? null,
        ageMinutes:
          walletSyncAgeMinutes === null
            ? null
            : Number(walletSyncAgeMinutes.toFixed(1)),
        stale: walletSyncAgeMinutes !== null && walletSyncAgeMinutes > 90,
      },
      reconciliation: {
        lastAt: lastReconciliation?.completedAt?.toISOString() ?? null,
        ageMinutes:
          reconciliationAgeMinutes === null
            ? null
            : Number(reconciliationAgeMinutes.toFixed(1)),
        stale:
          reconciliationAgeMinutes !== null && reconciliationAgeMinutes > 15,
      },
    };
  }

  parseFilters(query: AnalyticsQuery): AnalyticsFilters {
    const ownerId =
      query.ownerId === undefined ? undefined : Number(query.ownerId);
    if (ownerId !== undefined && (!Number.isInteger(ownerId) || ownerId <= 0)) {
      throw new BadRequestException('ownerId must be a positive integer');
    }
    if (query.mode && query.mode !== 'real' && query.mode !== 'paper') {
      throw new BadRequestException('mode must be real or paper');
    }
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }
    return {
      ownerId,
      runId: query.runId?.trim() || undefined,
      strategyId: query.strategyId?.trim() || undefined,
      symbol: query.symbol?.trim().toUpperCase() || undefined,
      mode: query.mode as AnalyticsFilters['mode'],
      from,
      to,
    };
  }

  async summary(filters: AnalyticsFilters) {
    const dataset = await this.loadDataset(filters);
    const result = calculateAnalytics(dataset.trades, dataset.initialEquity);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      runs: dataset.runs.length,
      metrics: result.metrics,
    };
  }

  async equityCurve(filters: AnalyticsFilters) {
    const dataset = await this.loadDataset(filters);
    const result = calculateAnalytics(dataset.trades, dataset.initialEquity);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      metrics: {
        initialEquity: result.metrics.initialEquity,
        finalEquity: result.metrics.finalEquity,
        netPnl: result.metrics.netPnl,
        maxDrawdown: result.metrics.maxDrawdown,
        maxDrawdownPct: result.metrics.maxDrawdownPct,
      },
      points: result.equityCurve,
    };
  }

  async drawdown(filters: AnalyticsFilters) {
    const dataset = await this.loadDataset(filters);
    const result = calculateAnalytics(dataset.trades, dataset.initialEquity);
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      maxDrawdown: result.metrics.maxDrawdown,
      maxDrawdownPct: result.metrics.maxDrawdownPct,
      recoveryFactor: result.metrics.recoveryFactor,
      underwater: result.equityCurve.filter((point) => point.drawdown > 0),
    };
  }

  async breakdown(filters: AnalyticsFilters, groupBy: AnalyticsGroupBy) {
    const dataset = await this.loadDataset(filters);
    const groups = new Map<string, AnalyticsTrade[]>();
    for (const trade of dataset.trades) {
      const key = this.groupKey(trade, groupBy);
      const bucket = groups.get(key) ?? [];
      bucket.push(trade);
      groups.set(key, bucket);
    }
    const initialByRun = new Map(
      dataset.runs.map((run) => [run.runId, run.initialEquity]),
    );
    const rows = Array.from(groups.entries()).map(([key, trades]) => {
      const runIds = new Set(trades.map((trade) => trade.runId));
      const initialEquity = Array.from(runIds).reduce(
        (sum, runId) => sum + (initialByRun.get(runId) ?? 0),
        0,
      );
      return {
        key,
        runs: runIds.size,
        ...calculateAnalytics(trades, initialEquity).metrics,
      };
    });
    rows.sort((a, b) => b.netPnl - a.netPnl);
    return {
      generatedAt: new Date().toISOString(),
      groupBy,
      filters: this.serializableFilters(filters),
      groups: rows,
    };
  }

  async trades(filters: AnalyticsFilters, limit = 100, offset = 0) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 500',
      );
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new BadRequestException('offset must be a non-negative integer');
    }
    const dataset = await this.loadDataset(filters);
    const ordered = [...dataset.trades].sort(
      (a, b) => b.closedAt.getTime() - a.closedAt.getTime() || b.id - a.id,
    );
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      total: ordered.length,
      limit,
      offset,
      data: ordered.slice(offset, offset + limit),
    };
  }

  async runnerCorrelation(input: {
    ownerId?: number;
    hoursBack?: number;
    bucketMinutes?: number;
  }) {
    const hoursBack = input.hoursBack ?? 24 * 7;
    const bucketMs = (input.bucketMinutes ?? 60) * 60_000;
    const since = new Date(Date.now() - hoursBack * 3_600_000);
    const runs = await this.prisma.botRunnerRun.findMany({
      where: { ownerId: input.ownerId },
      select: { id: true, runId: true, strategyId: true, symbol: true },
    });
    if (runs.length === 0) {
      return { generatedAt: new Date().toISOString(), runners: [], matrix: [] };
    }
    const snapshots = await this.prisma.botRunnerSnapshot.findMany({
      where: {
        botRunnerRunId: { in: runs.map((r) => r.id) },
        ts: { gte: since },
      },
      orderBy: { ts: 'asc' },
      select: { botRunnerRunId: true, ts: true, equity: true },
    });
    const buckets = new Set<number>();
    const perRunner = new Map<number, Map<number, number>>();
    for (const s of snapshots) {
      const bucket = Math.floor(s.ts.getTime() / bucketMs) * bucketMs;
      buckets.add(bucket);
      const map = perRunner.get(s.botRunnerRunId) ?? new Map<number, number>();
      map.set(bucket, Number(s.equity));
      perRunner.set(s.botRunnerRunId, map);
    }
    const sortedBuckets = Array.from(buckets).sort((a, b) => a - b);
    const runners = runs
      .filter((r) => (perRunner.get(r.id)?.size ?? 0) >= 3)
      .map((r) => {
        const map = perRunner.get(r.id)!;
        const equitySeries = sortedBuckets.map((b) => {
          const val = map.get(b);
          return val === undefined ? null : val;
        });
        this.forwardFill(equitySeries);
        const returns: number[] = [];
        for (let i = 1; i < equitySeries.length; i++) {
          const prev = equitySeries[i - 1];
          const cur = equitySeries[i];
          if (prev === null || cur === null) {
            returns.push(0);
          } else {
            returns.push(cur - prev);
          }
        }
        return {
          runId: r.runId,
          strategyId: r.strategyId,
          symbol: r.symbol,
          returns,
        };
      });
    const matrix = runners.map((a, i) =>
      runners.map((b, j) => (i === j ? 1 : this.pearson(a.returns, b.returns))),
    );
    return {
      generatedAt: new Date().toISOString(),
      hoursBack,
      bucketMinutes: input.bucketMinutes ?? 60,
      runners: runners.map((r) => ({
        runId: r.runId,
        strategyId: r.strategyId,
        symbol: r.symbol,
        samples: r.returns.length,
      })),
      matrix,
    };
  }

  async portfolioExposure(input: { ownerId?: number }) {
    const runs = await this.prisma.botRunnerRun.findMany({
      where: { ownerId: input.ownerId },
      select: {
        id: true,
        runId: true,
        strategyId: true,
        symbol: true,
        initialEquity: true,
      },
    });
    if (runs.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        byAsset: [],
        byRunner: [],
      };
    }
    const openTrades = await this.prisma.botRunnerTrade.findMany({
      where: {
        botRunnerRunId: { in: runs.map((r) => r.id) },
        closedAt: null,
      },
      select: {
        botRunnerRunId: true,
        symbol: true,
        side: true,
        entryPrice: true,
        quantity: true,
      },
    });
    const runById = new Map(runs.map((r) => [r.id, r]));
    const byAsset = new Map<
      string,
      {
        asset: string;
        longNotional: number;
        shortNotional: number;
        runnersInvolved: Set<string>;
        positions: number;
      }
    >();
    const byRunner = new Map<
      string,
      {
        runId: string;
        strategyId: string;
        symbol: string;
        openPositions: number;
        grossNotional: number;
        netExposure: number;
      }
    >();
    for (const t of openTrades) {
      const run = runById.get(t.botRunnerRunId);
      if (!run) continue;
      const asset = this.baseAssetFromSymbol(t.symbol);
      const notional = Number(t.entryPrice) * Number(t.quantity);
      const signed = t.side === 'BUY' ? notional : -notional;
      const aBucket = byAsset.get(asset) ?? {
        asset,
        longNotional: 0,
        shortNotional: 0,
        runnersInvolved: new Set<string>(),
        positions: 0,
      };
      if (signed >= 0) aBucket.longNotional += notional;
      else aBucket.shortNotional += notional;
      aBucket.runnersInvolved.add(run.runId);
      aBucket.positions += 1;
      byAsset.set(asset, aBucket);
      const rBucket = byRunner.get(run.runId) ?? {
        runId: run.runId,
        strategyId: run.strategyId,
        symbol: run.symbol,
        openPositions: 0,
        grossNotional: 0,
        netExposure: 0,
      };
      rBucket.openPositions += 1;
      rBucket.grossNotional += notional;
      rBucket.netExposure += signed;
      byRunner.set(run.runId, rBucket);
    }
    const totalGross = Array.from(byAsset.values()).reduce(
      (s, b) => s + b.longNotional + b.shortNotional,
      0,
    );
    return {
      generatedAt: new Date().toISOString(),
      totalGrossNotional: Number(totalGross.toFixed(8)),
      byAsset: Array.from(byAsset.values())
        .map((b) => ({
          asset: b.asset,
          longNotional: Number(b.longNotional.toFixed(8)),
          shortNotional: Number(b.shortNotional.toFixed(8)),
          grossNotional: Number((b.longNotional + b.shortNotional).toFixed(8)),
          netNotional: Number((b.longNotional - b.shortNotional).toFixed(8)),
          runnersInvolved: b.runnersInvolved.size,
          positions: b.positions,
          concentrationPct:
            totalGross > 0
              ? Number(
                  (
                    ((b.longNotional + b.shortNotional) / totalGross) *
                    100
                  ).toFixed(4),
                )
              : 0,
        }))
        .sort((a, b) => b.grossNotional - a.grossNotional),
      byRunner: Array.from(byRunner.values())
        .map((r) => ({
          ...r,
          grossNotional: Number(r.grossNotional.toFixed(8)),
          netExposure: Number(r.netExposure.toFixed(8)),
        }))
        .sort((a, b) => b.grossNotional - a.grossNotional),
    };
  }

  private forwardFill(series: (number | null)[]): void {
    let last: number | null = null;
    for (let i = 0; i < series.length; i++) {
      if (series[i] === null) {
        series[i] = last;
      } else {
        last = series[i];
      }
    }
  }

  private pearson(a: number[], b: number[]): number {
    const n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
      sa += a[i];
      sb += b[i];
    }
    const ma = sa / n;
    const mb = sb / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      const xa = a[i] - ma;
      const xb = b[i] - mb;
      num += xa * xb;
      da += xa * xa;
      db += xb * xb;
    }
    const den = Math.sqrt(da * db);
    return den === 0 ? 0 : Number((num / den).toFixed(6));
  }

  /**
   * Moneda quote implícita de un símbolo (mismo criterio que
   * bot-runner.service.ts#quoteCurrencyFromSymbol, usado al emitir
   * CapitalEvent) -- se duplica acá porque no vale la pena un import
   * cruzado solo por esta función de 10 líneas.
   */
  private quoteCurrencyFromSymbol(symbol: string): string {
    const quotes = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'BTC', 'ETH', 'BNB'];
    for (const q of quotes) {
      if (symbol.endsWith(q)) return q;
    }
    return 'USDT';
  }

  /**
   * Estado de cuenta: por cada runner seleccionado, el capital inicial
   * configurado (en la moneda quote de su símbolo) más el movimiento
   * cronológico completo de CapitalEvent (TRADE_PNL/FEE/FUNDING/INTEREST/
   * REBATE/DEPOSIT/WITHDRAWAL/ADJUSTMENT) da el balance corriente real por
   * moneda. No se mezclan monedas entre sí: cada bucket de moneda se arma
   * y se cierra por separado para no sumar, por ejemplo, USDT con BTC.
   */
  async statement(filters: AnalyticsFilters) {
    const dataset = await this.loadDataset(filters);
    if (dataset.runs.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        filters: this.serializableFilters(filters),
        byCurrency: [],
        totals: null,
        trades: [],
        capitalEvents: [],
      };
    }

    const runIds = dataset.runs.map((run) => run.id);
    const openingByCurrency = new Map<string, Prisma.Decimal>();
    for (const run of dataset.runs) {
      const currency = this.quoteCurrencyFromSymbol(run.symbol);
      const current = openingByCurrency.get(currency) ?? new Prisma.Decimal(0);
      openingByCurrency.set(
        currency,
        current.plus(run.initialEquity ?? 0),
      );
    }

    // Si el filtro empieza en un punto intermedio, hay que arrastrar todo
    // lo ocurrido antes de esa fecha para que el balance de apertura del
    // período sea el balance real a esa fecha, no el capital inicial del
    // runner completo.
    if (filters.from) {
      const prior = await this.prisma.capitalEvent.groupBy({
        by: ['currency'],
        where: {
          botRunnerRunId: { in: runIds },
          occurredAt: { lt: filters.from },
        },
        _sum: { amount: true },
      });
      for (const row of prior) {
        const current = openingByCurrency.get(row.currency) ?? new Prisma.Decimal(0);
        openingByCurrency.set(
          row.currency,
          current.plus(row._sum.amount ?? 0),
        );
      }
    }

    const occurredAtWindow =
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined;
    const events = await this.prisma.capitalEvent.findMany({
      where: { botRunnerRunId: { in: runIds }, occurredAt: occurredAtWindow },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });

    const runningByCurrency = new Map<string, Prisma.Decimal>(
      openingByCurrency,
    );
    const ledgerRows = events.map((event) => {
      const amount = new Prisma.Decimal(event.amount);
      const running = (
        runningByCurrency.get(event.currency) ?? new Prisma.Decimal(0)
      ).plus(amount);
      runningByCurrency.set(event.currency, running);
      return {
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        type: event.type,
        amount: Number(amount.toFixed(8)),
        currency: event.currency,
        tradeId: event.tradeId,
        correlationId: event.correlationId,
        source: event.source,
        runningBalance: Number(running.toFixed(8)),
      };
    });

    const allCurrencies = new Set<string>([
      ...openingByCurrency.keys(),
      ...runningByCurrency.keys(),
    ]);
    const byCurrency = Array.from(allCurrencies).map((currency) => {
      const opening = openingByCurrency.get(currency) ?? new Prisma.Decimal(0);
      const closing = runningByCurrency.get(currency) ?? opening;
      return {
        currency,
        openingBalance: Number(opening.toFixed(8)),
        closingBalance: Number(closing.toFixed(8)),
        netChange: Number(closing.minus(opening).toFixed(8)),
      };
    });

    const result = calculateAnalytics(dataset.trades, dataset.initialEquity);
    const tradeRows = dataset.trades.map((trade) => ({
      tradeId: trade.id,
      runId: trade.runId,
      strategyId: trade.strategyId,
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      quantity: trade.quantity,
      grossPnl: Number((trade.pnl + trade.fees).toFixed(8)),
      fee: trade.fees,
      netPnl: trade.pnl,
      pnlPct: trade.pnlPct,
      openedAt: trade.openedAt.toISOString(),
      closedAt: trade.closedAt.toISOString(),
    }));

    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      byCurrency,
      totals: {
        netPnl: result.metrics.netPnl,
        grossPnlBeforeFees: result.metrics.grossPnlBeforeFees,
        totalFees: result.metrics.totalFees,
        totalTrades: result.metrics.totalTrades,
        feeDragPct: result.metrics.feeDragPct,
      },
      trades: tradeRows,
      capitalEvents: ledgerRows,
    };
  }

  /** Mismo contenido que statement(), serializado a CSV (una fila por trade). */
  async statementCsv(filters: AnalyticsFilters): Promise<string> {
    const statement = await this.statement(filters);
    const header = [
      'tradeId',
      'runId',
      'strategyId',
      'symbol',
      'side',
      'entryPrice',
      'exitPrice',
      'quantity',
      'grossPnl',
      'fee',
      'netPnl',
      'pnlPct',
      'openedAt',
      'closedAt',
    ];
    const escape = (value: unknown) => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const trade of statement.trades) {
      lines.push(header.map((key) => escape((trade as any)[key])).join(','));
    }
    return lines.join('\n');
  }

  /**
   * Monte Carlo de riesgo de ruina: resamplea con reemplazo el PnL neto de
   * los trades cerrados que matchean `filters` para proyectar la curva de
   * equity `horizonTrades` operaciones hacia adelante. Si `filters.runId`
   * apunta a un único runner con RiskProfile, usa su `maxDrawdownPct` como
   * umbral para reportar probabilidad de breach -- no inventa un umbral
   * default si no hay uno configurado.
   */
  async monteCarlo(
    filters: AnalyticsFilters,
    options: {
      simulations?: number;
      horizonTrades?: number;
      ruinThreshold?: number;
    } = {},
  ) {
    const simulations = options.simulations ?? 2000;
    const horizonTrades = options.horizonTrades ?? 100;
    if (!Number.isInteger(simulations) || simulations < 100 || simulations > 20_000) {
      throw new BadRequestException('simulations debe ser un entero 100..20000');
    }
    if (!Number.isInteger(horizonTrades) || horizonTrades < 1 || horizonTrades > 5000) {
      throw new BadRequestException('horizonTrades debe ser un entero 1..5000');
    }

    const dataset = await this.loadDataset(filters);
    const MIN_TRADES = 20;
    if (dataset.trades.length < MIN_TRADES) {
      return {
        status: 'INSUFFICIENT_DATA' as const,
        filters: this.serializableFilters(filters),
        tradesAvailable: dataset.trades.length,
        minRequired: MIN_TRADES,
      };
    }

    let maxDrawdownPctThreshold: number | undefined;
    if (filters.runId) {
      const run = await this.prisma.botRunnerRun.findUnique({
        where: { runId: filters.runId },
        select: { riskProfileId: true },
      });
      if (run?.riskProfileId) {
        const profile = await this.prisma.riskProfile.findUnique({
          where: { id: run.riskProfileId },
          select: { maxDrawdownPct: true },
        });
        maxDrawdownPctThreshold = profile?.maxDrawdownPct;
      }
    }

    const result = simulateEquityPaths({
      historicalPnl: dataset.trades.map((trade) => trade.pnl),
      startingEquity: dataset.initialEquity,
      horizonTrades,
      simulations,
      ruinThreshold: options.ruinThreshold ?? 0,
      maxDrawdownPctThreshold,
    });

    return {
      status: 'OK' as const,
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      maxDrawdownPctThreshold: maxDrawdownPctThreshold ?? null,
      ...result,
    };
  }

  private baseAssetFromSymbol(symbol: string): string {
    const quotes = [
      'USDT',
      'USDC',
      'BUSD',
      'FDUSD',
      'TUSD',
      'BTC',
      'ETH',
      'BNB',
    ];
    for (const q of quotes) {
      if (symbol.endsWith(q)) return symbol.slice(0, symbol.length - q.length);
    }
    return symbol;
  }

  async rollup(input: {
    filters: AnalyticsFilters;
    period: 'day' | 'week' | 'month';
  }) {
    const dataset = await this.loadDataset(input.filters);
    const buckets = new Map<
      string,
      {
        period: string;
        trades: number;
        wins: number;
        losses: number;
        netPnl: number;
        fees: number;
        totalR: number;
        tradesWithRisk: number;
        firstAt: Date;
        lastAt: Date;
      }
    >();
    for (const trade of dataset.trades) {
      const key = this.periodKey(trade.closedAt, input.period);
      const bucket = buckets.get(key) ?? {
        period: key,
        trades: 0,
        wins: 0,
        losses: 0,
        netPnl: 0,
        fees: 0,
        totalR: 0,
        tradesWithRisk: 0,
        firstAt: trade.closedAt,
        lastAt: trade.closedAt,
      };
      bucket.trades += 1;
      if (trade.pnl > 0) bucket.wins += 1;
      else if (trade.pnl < 0) bucket.losses += 1;
      bucket.netPnl += trade.pnl;
      bucket.fees += trade.fees;
      const r =
        trade.rMultiple !== null
          ? trade.rMultiple
          : trade.initialRisk !== null && trade.initialRisk > 0
            ? trade.pnl / trade.initialRisk
            : null;
      if (r !== null) {
        bucket.totalR += r;
        bucket.tradesWithRisk += 1;
      }
      if (trade.closedAt < bucket.firstAt) bucket.firstAt = trade.closedAt;
      if (trade.closedAt > bucket.lastAt) bucket.lastAt = trade.closedAt;
      buckets.set(key, bucket);
    }
    const rows = Array.from(buckets.values())
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((b) => ({
        period: b.period,
        trades: b.trades,
        wins: b.wins,
        losses: b.losses,
        winRatePct:
          b.trades > 0 ? Number(((b.wins / b.trades) * 100).toFixed(4)) : 0,
        netPnl: Number(b.netPnl.toFixed(8)),
        fees: Number(b.fees.toFixed(8)),
        expectancy: b.trades > 0 ? Number((b.netPnl / b.trades).toFixed(8)) : 0,
        averageR:
          b.tradesWithRisk > 0
            ? Number((b.totalR / b.tradesWithRisk).toFixed(6))
            : null,
        tradesWithRisk: b.tradesWithRisk,
        firstAt: b.firstAt.toISOString(),
        lastAt: b.lastAt.toISOString(),
      }));
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const row of rows) {
      cumulative += row.netPnl;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
      (row as any).cumulativeNetPnl = Number(cumulative.toFixed(8));
      (row as any).drawdownAfter = Number((peak - cumulative).toFixed(8));
    }
    return {
      generatedAt: new Date().toISOString(),
      period: input.period,
      filters: this.serializableFilters(input.filters),
      totals: {
        trades: dataset.trades.length,
        netPnl: Number(cumulative.toFixed(8)),
        maxRollupDrawdown: Number(maxDrawdown.toFixed(8)),
      },
      rows,
    };
  }

  private periodKey(date: Date, period: 'day' | 'week' | 'month'): string {
    const iso = date.toISOString();
    if (period === 'day') return iso.slice(0, 10);
    if (period === 'month') return iso.slice(0, 7);
    const d = new Date(date);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const days = Math.floor((d.getTime() - yearStart.getTime()) / 86_400_000);
    const week = Math.floor((days + yearStart.getUTCDay()) / 7);
    return `${d.getUTCFullYear()}-W${String(week + 1).padStart(2, '0')}`;
  }

  async kellySuggestion(input: {
    strategyId: string;
    symbol?: string;
    mode?: 'real' | 'paper';
    ownerId?: number;
    fraction?: number;
    cap?: number;
    minTrades?: number;
  }) {
    if (!input.strategyId) {
      throw new BadRequestException('strategyId required');
    }
    const dataset = await this.loadDataset({
      strategyId: input.strategyId,
      symbol: input.symbol,
      mode: input.mode,
      ownerId: input.ownerId,
    });
    const trades = dataset.trades;
    const minTrades = input.minTrades ?? 30;
    if (trades.length < minTrades) {
      return {
        generatedAt: new Date().toISOString(),
        strategyId: input.strategyId,
        symbol: input.symbol ?? null,
        mode: input.mode ?? null,
        tradesAnalyzed: trades.length,
        minTrades,
        suggestion: null,
        reason: `insufficient trades: ${trades.length}/${minTrades}`,
      };
    }
    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);
    const winRate = wins.length / trades.length;
    const avgWin =
      wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss =
      losses.length > 0
        ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0)) / losses.length
        : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : null;
    if (
      winRate <= 0 ||
      winRate >= 1 ||
      winLossRatio === null ||
      winLossRatio <= 0
    ) {
      return {
        generatedAt: new Date().toISOString(),
        strategyId: input.strategyId,
        symbol: input.symbol ?? null,
        mode: input.mode ?? null,
        tradesAnalyzed: trades.length,
        minTrades,
        suggestion: null,
        reason: 'edge undefined (need wins and losses)',
        winRate,
        winLossRatio,
      };
    }
    const rawKelly = winRate - (1 - winRate) / winLossRatio;
    const fraction = input.fraction ?? 0.5;
    const cap = input.cap ?? 0.25;
    const applied = Math.max(0, Math.min(rawKelly * fraction, cap));
    return {
      generatedAt: new Date().toISOString(),
      strategyId: input.strategyId,
      symbol: input.symbol ?? null,
      mode: input.mode ?? null,
      tradesAnalyzed: trades.length,
      minTrades,
      winRate: Number(winRate.toFixed(6)),
      avgWin: Number(avgWin.toFixed(8)),
      avgLoss: Number(avgLoss.toFixed(8)),
      winLossRatio: Number(winLossRatio.toFixed(6)),
      rawKelly: Number(rawKelly.toFixed(6)),
      appliedFraction: Number(applied.toFixed(6)),
      fractionCap: cap,
      halfKellyFactor: fraction,
      suggestion:
        rawKelly <= 0
          ? {
              type: 'fixed-pct',
              config: { pct: 0 },
              notes: 'edge negativo: no operar hasta reajustar strategy',
            }
          : {
              type: 'kelly',
              config: {
                winRate: Number(winRate.toFixed(6)),
                winLossRatio: Number(winLossRatio.toFixed(6)),
                fraction,
                cap,
              },
            },
    };
  }

  async compareModes(input: {
    strategyId: string;
    symbol?: string;
    ownerId?: number;
  }) {
    if (!input.strategyId) {
      throw new BadRequestException('strategyId required');
    }
    const runnerFilters: AnalyticsFilters = {
      strategyId: input.strategyId,
      symbol: input.symbol,
      ownerId: input.ownerId,
    };
    const [realTrades, paperTrades, backtestTrades] = await Promise.all([
      this.loadDataset({ ...runnerFilters, mode: 'real' }).then(
        (d) => d.trades,
      ),
      this.loadDataset({ ...runnerFilters, mode: 'paper' }).then(
        (d) => d.trades,
      ),
      this.loadBacktestTrades(input.strategyId, input.symbol),
    ]);
    const build = (trades: AnalyticsTrade[]) => {
      if (trades.length === 0) {
        return { trades: 0, metrics: null };
      }
      const res = calculateAnalytics(trades, 0);
      return { trades: trades.length, metrics: res.metrics };
    };
    return {
      generatedAt: new Date().toISOString(),
      strategyId: input.strategyId,
      symbol: input.symbol ?? null,
      modes: {
        backtest: build(backtestTrades),
        paper: build(paperTrades),
        real: build(realTrades),
      },
    };
  }

  private async loadBacktestTrades(
    strategyId: string,
    symbol?: string,
  ): Promise<AnalyticsTrade[]> {
    const runs = await this.prisma.backtestRun.findMany({
      where: { strategyId, symbol },
      select: { id: true },
    });
    if (runs.length === 0) return [];
    const rows = await this.prisma.backtestTrade.findMany({
      where: { backtestRunId: { in: runs.map((r) => r.id) } },
      orderBy: [{ exitTime: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      runId: `bt-${r.backtestRunId}`,
      strategyId,
      mode: 'backtest',
      symbol: symbol ?? '',
      side: r.side,
      entryPrice: Number(r.entryPrice),
      exitPrice: Number(r.exitPrice),
      quantity: Number(r.quantity),
      pnl: Number(r.pnl),
      pnlPct: Number(r.pnlPct),
      fees: Number(r.fees),
      mae: null,
      mfe: null,
      initialRisk: null,
      rMultiple: null,
      openedAt: r.entryTime,
      closedAt: r.exitTime,
      reason: r.reason,
      marketRegime: null,
    }));
  }

  async execution(filters: AnalyticsFilters, groupBy?: AnalyticsGroupBy) {
    const samples = await this.loadExecutionSamples(filters);
    if (!groupBy) {
      return {
        generatedAt: new Date().toISOString(),
        filters: this.serializableFilters(filters),
        metrics: calculateExecutionMetrics(samples),
      };
    }
    const groups = new Map<string, ExecutionSample[]>();
    for (const sample of samples) {
      const key =
        groupBy === 'strategy'
          ? sample.strategyId
          : groupBy === 'symbol'
            ? sample.symbol
            : groupBy === 'mode'
              ? sample.mode
              : sample.runId;
      const bucket = groups.get(key) ?? [];
      bucket.push(sample);
      groups.set(key, bucket);
    }
    const rows = Array.from(groups.entries()).map(([key, groupSamples]) => ({
      key,
      ...calculateExecutionMetrics(groupSamples),
    }));
    rows.sort(
      (a, b) =>
        b.totalSlippageQuote +
        b.totalFees -
        (a.totalSlippageQuote + a.totalFees),
    );
    return {
      generatedAt: new Date().toISOString(),
      filters: this.serializableFilters(filters),
      groupBy,
      groups: rows,
    };
  }

  private async loadDataset(filters: AnalyticsFilters): Promise<{
    runs: Array<{
      id: number;
      runId: string;
      symbol: string;
      initialEquity: number;
    }>;
    trades: AnalyticsTrade[];
    initialEquity: number;
  }> {
    const runWhere = {
      ownerId: filters.ownerId,
      runId: filters.runId,
      strategyId: filters.strategyId,
      symbol: filters.symbol,
      exchangeMode: filters.mode,
    };
    const runs = await this.prisma.botRunnerRun.findMany({
      where: runWhere,
      select: { id: true, runId: true, symbol: true, initialEquity: true },
    });
    const runIds = runs.map((run) => run.id);
    if (runIds.length === 0) {
      return { runs: [], trades: [], initialEquity: 0 };
    }
    const closedAt =
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined;
    const records = await this.prisma.botRunnerTrade.findMany({
      where: {
        botRunnerRunId: { in: runIds },
        closedAt: { not: null, ...closedAt },
      },
      select: {
        id: true,
        symbol: true,
        side: true,
        entryPrice: true,
        exitPrice: true,
        quantity: true,
        pnl: true,
        pnlPct: true,
        fee: true,
        mae: true,
        mfe: true,
        initialRisk: true,
        rMultiple: true,
        openedAt: true,
        closedAt: true,
        reason: true,
        marketRegime: true,
        botRunnerRun: {
          select: {
            runId: true,
            strategyId: true,
            exchangeMode: true,
          },
        },
      },
      orderBy: [{ closedAt: 'asc' }, { id: 'asc' }],
    });
    const trades: AnalyticsTrade[] = records.flatMap((record) => {
      if (
        record.closedAt === null ||
        record.exitPrice === null ||
        record.pnl === null ||
        record.pnlPct === null
      ) {
        return [];
      }
      return [
        {
          id: record.id,
          runId: record.botRunnerRun.runId,
          strategyId: record.botRunnerRun.strategyId,
          mode: record.botRunnerRun.exchangeMode,
          symbol: record.symbol,
          side: record.side,
          entryPrice: Number(record.entryPrice),
          exitPrice: Number(record.exitPrice),
          quantity: Number(record.quantity),
          pnl: Number(record.pnl),
          pnlPct: Number(record.pnlPct),
          fees: Number(record.fee),
          mae: record.mae === null ? null : Number(record.mae),
          mfe: record.mfe === null ? null : Number(record.mfe),
          initialRisk:
            record.initialRisk === null ? null : Number(record.initialRisk),
          rMultiple:
            record.rMultiple === null ? null : Number(record.rMultiple),
          openedAt: record.openedAt,
          closedAt: record.closedAt,
          reason: record.reason,
          marketRegime: record.marketRegime,
        },
      ];
    });
    const normalizedRuns = runs.map((run) => ({
      id: run.id,
      runId: run.runId,
      symbol: run.symbol,
      initialEquity: Number(run.initialEquity ?? 0),
    }));
    return {
      runs: normalizedRuns,
      trades,
      initialEquity: normalizedRuns.reduce(
        (sum, run) => sum + run.initialEquity,
        0,
      ),
    };
  }

  private groupKey(trade: AnalyticsTrade, groupBy: AnalyticsGroupBy): string {
    if (groupBy === 'strategy') return trade.strategyId;
    if (groupBy === 'symbol') return trade.symbol;
    if (groupBy === 'mode') return trade.mode;
    if (groupBy === 'regime') return trade.marketRegime ?? 'UNKNOWN';
    return trade.runId;
  }

  private async loadExecutionSamples(
    filters: AnalyticsFilters,
  ): Promise<ExecutionSample[]> {
    const requestedAt =
      filters.from || filters.to
        ? { gte: filters.from, lte: filters.to }
        : undefined;
    const records = await this.prisma.executionMetric.findMany({
      where: {
        symbol: filters.symbol,
        mode: filters.mode,
        requestedAt,
        botRunnerRun: {
          runId: filters.runId,
          strategyId: filters.strategyId,
          ownerId: filters.ownerId,
        },
      },
      select: {
        id: true,
        symbol: true,
        mode: true,
        status: true,
        notional: true,
        fee: true,
        spreadBps: true,
        slippageBps: true,
        slippageQuote: true,
        latencyMs: true,
        botRunnerRun: { select: { runId: true, strategyId: true } },
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => ({
      id: record.id,
      runId: record.botRunnerRun.runId,
      strategyId: record.botRunnerRun.strategyId,
      mode: record.mode,
      symbol: record.symbol,
      status: record.status,
      notional: record.notional === null ? null : Number(record.notional),
      fee: Number(record.fee),
      spreadBps: record.spreadBps === null ? null : Number(record.spreadBps),
      slippageBps:
        record.slippageBps === null ? null : Number(record.slippageBps),
      slippageQuote:
        record.slippageQuote === null ? null : Number(record.slippageQuote),
      latencyMs: record.latencyMs,
    }));
  }

  private parseDate(value: string | undefined, name: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${name} must be a valid ISO date`);
    }
    return date;
  }

  private serializableFilters(filters: AnalyticsFilters) {
    return {
      ...filters,
      from: filters.from?.toISOString(),
      to: filters.to?.toISOString(),
    };
  }
}
