import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BotRunnerRun,
  BotRunnerTrade,
  BotRunnerSnapshot,
  OrderSide,
  Prisma,
  PrismaClient,
  RunnerStatus,
} from '@prisma/client';

export interface CreateRunInput {
  runId: string;
  strategyId: string;
  ownerId?: number;
  symbol: string;
  timeframe: string;
  exchangeMode: 'real' | 'paper';
  exchangeId?: string;
  paperAccountId?: number;
  riskProfileId?: number;
  config: Record<string, unknown>;
  initialEquity: number;
}

export interface OpenTradeInput {
  botRunnerRunId: number;
  orderId: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  fee: number;
  reason?: string;
}

export interface CloseTradeInput {
  tradeId: number;
  orderId: string;
  exitPrice: number;
  additionalFee: number;
  reason?: string;
}

@Injectable()
export class BotRunnerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createRun(input: CreateRunInput): Promise<BotRunnerRun> {
    return this.prisma.botRunnerRun.create({
      data: {
        runId: input.runId,
        strategyId: input.strategyId,
        ownerId: input.ownerId,
        symbol: input.symbol,
        timeframe: input.timeframe,
        exchangeMode: input.exchangeMode,
        exchangeId: input.exchangeId,
        paperAccountId: input.paperAccountId,
        riskProfileId: input.riskProfileId,
        config: input.config as unknown as Prisma.InputJsonValue,
        initialEquity: new Prisma.Decimal(input.initialEquity),
        peakEquity: new Prisma.Decimal(input.initialEquity),
        status: RunnerStatus.RUNNING,
      },
    });
  }

  async stopRun(runId: string, finalEquity: number, errorMessage?: string): Promise<BotRunnerRun> {
    const run = await this.byRunId(runId);
    return this.prisma.botRunnerRun.update({
      where: { id: run.id },
      data: {
        status: errorMessage ? RunnerStatus.ERROR : RunnerStatus.STOPPED,
        finalEquity: new Prisma.Decimal(finalEquity),
        stoppedAt: new Date(),
        lastError: errorMessage,
      },
    });
  }

  async byRunId(runId: string): Promise<BotRunnerRun> {
    const run = await this.prisma.botRunnerRun.findUnique({ where: { runId } });
    if (!run) throw new NotFoundException(`BotRunnerRun runId=${runId} not found`);
    return run;
  }

  async touchStats(
    runId: string,
    deltas: {
      ticks?: number;
      signals?: number;
      ordersPlaced?: number;
      ordersRejected?: number;
      errors?: number;
      peakEquity?: number;
      dailyPnl?: number;
      realizedPnl?: number;
      lastError?: string | null;
    },
  ): Promise<void> {
    const data: Prisma.BotRunnerRunUpdateInput = {};
    if (deltas.ticks) data.ticks = { increment: deltas.ticks };
    if (deltas.signals) data.signals = { increment: deltas.signals };
    if (deltas.ordersPlaced) data.ordersPlaced = { increment: deltas.ordersPlaced };
    if (deltas.ordersRejected) data.ordersRejected = { increment: deltas.ordersRejected };
    if (deltas.errors) data.errors = { increment: deltas.errors };
    if (deltas.peakEquity !== undefined) data.peakEquity = new Prisma.Decimal(deltas.peakEquity);
    if (deltas.dailyPnl !== undefined) data.dailyPnl = new Prisma.Decimal(deltas.dailyPnl);
    if (deltas.realizedPnl !== undefined) data.realizedPnl = new Prisma.Decimal(deltas.realizedPnl);
    if (deltas.lastError !== undefined) data.lastError = deltas.lastError;
    if (Object.keys(data).length === 0) return;
    await this.prisma.botRunnerRun.update({ where: { runId }, data });
  }

  async openTrade(input: OpenTradeInput): Promise<BotRunnerTrade> {
    return this.prisma.botRunnerTrade.create({
      data: {
        botRunnerRunId: input.botRunnerRunId,
        orderId: input.orderId,
        symbol: input.symbol,
        side: input.side,
        entryPrice: new Prisma.Decimal(input.entryPrice),
        quantity: new Prisma.Decimal(input.quantity),
        fee: new Prisma.Decimal(input.fee),
        reason: input.reason,
      },
    });
  }

  async closeTrade(input: CloseTradeInput): Promise<BotRunnerTrade> {
    const trade = await this.prisma.botRunnerTrade.findUnique({ where: { id: input.tradeId } });
    if (!trade) throw new NotFoundException(`Trade ${input.tradeId} not found`);
    const entry = Number(trade.entryPrice);
    const qty = Number(trade.quantity);
    const prevFee = Number(trade.fee);
    const totalFee = prevFee + input.additionalFee;
    const pnl =
      trade.side === OrderSide.BUY
        ? (input.exitPrice - entry) * qty - totalFee
        : (entry - input.exitPrice) * qty - totalFee;
    const pnlPct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0;
    return this.prisma.botRunnerTrade.update({
      where: { id: input.tradeId },
      data: {
        exitPrice: new Prisma.Decimal(input.exitPrice),
        closedAt: new Date(),
        fee: new Prisma.Decimal(totalFee),
        pnl: new Prisma.Decimal(pnl),
        pnlPct: new Prisma.Decimal(pnlPct),
        reason: input.reason ?? trade.reason,
      },
    });
  }

  async findOpenTrade(botRunnerRunId: number, symbol: string, side: OrderSide): Promise<BotRunnerTrade | null> {
    return this.prisma.botRunnerTrade.findFirst({
      where: { botRunnerRunId, symbol, side, closedAt: null },
      orderBy: { openedAt: 'asc' },
    });
  }

  async listOpenTrades(botRunnerRunId: number): Promise<BotRunnerTrade[]> {
    return this.prisma.botRunnerTrade.findMany({
      where: { botRunnerRunId, closedAt: null },
      orderBy: { openedAt: 'asc' },
    });
  }

  async computeDailyPnl(botRunnerRunId: number): Promise<number> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const trades = await this.prisma.botRunnerTrade.findMany({
      where: {
        botRunnerRunId,
        closedAt: { gte: dayStart },
        pnl: { not: null },
      },
      select: { pnl: true },
    });
    return trades.reduce((a, t) => a + Number(t.pnl ?? 0), 0);
  }

  async snapshot(input: {
    botRunnerRunId: number;
    equity: number;
    drawdownPct: number;
    openPositions: number;
    extras?: Record<string, unknown>;
  }): Promise<BotRunnerSnapshot> {
    return this.prisma.botRunnerSnapshot.create({
      data: {
        botRunnerRunId: input.botRunnerRunId,
        equity: new Prisma.Decimal(input.equity),
        drawdownPct: input.drawdownPct,
        openPositions: input.openPositions,
        extras: input.extras
          ? (input.extras as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async listRuns(filters: { ownerId?: number; status?: RunnerStatus; limit?: number } = {}) {
    return this.prisma.botRunnerRun.findMany({
      where: {
        ownerId: filters.ownerId,
        status: filters.status,
      },
      orderBy: { startedAt: 'desc' },
      take: Math.min(filters.limit ?? 50, 200),
    });
  }

  async listTrades(botRunnerRunId: number, limit = 100) {
    return this.prisma.botRunnerTrade.findMany({
      where: { botRunnerRunId },
      orderBy: { openedAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async listSnapshots(botRunnerRunId: number, limit = 200) {
    return this.prisma.botRunnerSnapshot.findMany({
      where: { botRunnerRunId },
      orderBy: { ts: 'asc' },
      take: Math.min(limit, 1000),
    });
  }
}
