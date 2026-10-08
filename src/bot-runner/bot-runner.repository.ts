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
  stopLossPrice?: number;
  reason?: string;
  marketRegime?: string;
  regimeConfidence?: number;
  regimeSnapshot?: Record<string, unknown>;
  timeframeScore?: number;
  timeframeSnapshot?: Record<string, unknown>;
}

export interface CloseTradeInput {
  tradeId: number;
  orderId: string;
  exitPrice: number;
  additionalFee: number;
  reason?: string;
}

export interface CreateTraceInput {
  botRunnerRunId: number;
  correlationId: string;
  eventType: string;
  symbol: string;
  orderId?: string;
  tradeId?: number;
  payload?: Record<string, unknown>;
}

export interface CreateExecutionMetricInput {
  botRunnerRunId: number;
  correlationId: string;
  orderId?: string;
  exchange: string;
  mode: string;
  symbol: string;
  side: OrderSide;
  orderType: string;
  market?: string;
  status: string;
  expectedPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  spreadBps?: number;
  requestedQuantity?: number;
  filledQuantity?: number;
  fillPrice?: number;
  notional?: number;
  fee?: number;
  feeCurrency?: string;
  slippageBps?: number;
  slippageQuote?: number;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  requestedAt: Date;
  respondedAt: Date;
}

@Injectable()
export class BotRunnerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * `create()` puro fallaba con unique constraint SIEMPRE que runId ya
   * existía — o sea en TODO restart manual de un bot ya usado antes, y en
   * TODA resurrección del reconciler al reiniciar el proceso (encuentra
   * la fila RUNNING justamente porque ya existe). Con upsert: fila nueva
   * -> insert fresco; fila existente -> se reabre preservando su
   * historial acumulado (peakEquity/dailyPnl/ticks/etc), no se resetea
   * como si fuera un run distinto.
   */
  async createRun(input: CreateRunInput): Promise<BotRunnerRun> {
    return this.prisma.botRunnerRun.upsert({
      where: { runId: input.runId },
      create: {
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
      update: {
        status: RunnerStatus.RUNNING,
        stoppedAt: null,
        lastError: null,
        config: input.config as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async stopRun(
    runId: string,
    finalEquity: number,
    errorMessage?: string,
  ): Promise<BotRunnerRun> {
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
    if (!run)
      throw new NotFoundException(`BotRunnerRun runId=${runId} not found`);
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
    if (deltas.ordersPlaced)
      data.ordersPlaced = { increment: deltas.ordersPlaced };
    if (deltas.ordersRejected)
      data.ordersRejected = { increment: deltas.ordersRejected };
    if (deltas.errors) data.errors = { increment: deltas.errors };
    if (deltas.peakEquity !== undefined)
      data.peakEquity = new Prisma.Decimal(deltas.peakEquity);
    if (deltas.dailyPnl !== undefined)
      data.dailyPnl = new Prisma.Decimal(deltas.dailyPnl);
    if (deltas.realizedPnl !== undefined)
      data.realizedPnl = new Prisma.Decimal(deltas.realizedPnl);
    if (deltas.lastError !== undefined) data.lastError = deltas.lastError;
    if (Object.keys(data).length === 0) return;
    await this.prisma.botRunnerRun.update({ where: { runId }, data });
  }

  async openTrade(input: OpenTradeInput): Promise<BotRunnerTrade> {
    const stopLossPrice =
      input.stopLossPrice !== undefined && Number.isFinite(input.stopLossPrice)
        ? input.stopLossPrice
        : undefined;
    const initialRisk =
      stopLossPrice !== undefined
        ? Math.abs(input.entryPrice - stopLossPrice) * input.quantity
        : undefined;
    return this.prisma.botRunnerTrade.create({
      data: {
        botRunnerRunId: input.botRunnerRunId,
        orderId: input.orderId,
        symbol: input.symbol,
        side: input.side,
        entryPrice: new Prisma.Decimal(input.entryPrice),
        quantity: new Prisma.Decimal(input.quantity),
        fee: new Prisma.Decimal(input.fee),
        stopLossPrice:
          stopLossPrice === undefined
            ? undefined
            : new Prisma.Decimal(stopLossPrice),
        initialRisk:
          initialRisk === undefined || initialRisk <= 0
            ? undefined
            : new Prisma.Decimal(initialRisk),
        reason: input.reason,
        marketRegime: input.marketRegime,
        regimeConfidence: input.regimeConfidence,
        regimeSnapshot: input.regimeSnapshot
          ? (JSON.parse(
              JSON.stringify(input.regimeSnapshot),
            ) as Prisma.InputJsonValue)
          : undefined,
        timeframeScore: input.timeframeScore,
        timeframeSnapshot: input.timeframeSnapshot
          ? (JSON.parse(
              JSON.stringify(input.timeframeSnapshot),
            ) as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async closeTrade(input: CloseTradeInput): Promise<BotRunnerTrade> {
    const trade = await this.prisma.botRunnerTrade.findUnique({
      where: { id: input.tradeId },
    });
    if (!trade) throw new NotFoundException(`Trade ${input.tradeId} not found`);
    const entry = Number(trade.entryPrice);
    const qty = Number(trade.quantity);
    const prevFee = Number(trade.fee);
    const totalFee = prevFee + input.additionalFee;
    const pnl =
      trade.side === OrderSide.BUY
        ? (input.exitPrice - entry) * qty - totalFee
        : (entry - input.exitPrice) * qty - totalFee;
    const notional = entry * qty;
    const pnlPct = notional > 0 ? (pnl / notional) * 100 : 0;

    // MAE / MFE desde peak/trough acumulados durante el trade
    const peak = trade.peakPrice
      ? Number(trade.peakPrice)
      : Math.max(entry, input.exitPrice);
    const trough = trade.troughPrice
      ? Number(trade.troughPrice)
      : Math.min(entry, input.exitPrice);
    let mfe = 0;
    let mae = 0;
    if (trade.side === OrderSide.BUY) {
      mfe = (peak - entry) * qty;
      mae = (trough - entry) * qty;
    } else {
      mfe = (entry - trough) * qty;
      mae = (entry - peak) * qty;
    }
    const mfePct = notional > 0 ? (mfe / notional) * 100 : 0;
    const maePct = notional > 0 ? (mae / notional) * 100 : 0;
    const initialRisk = trade.initialRisk ? Number(trade.initialRisk) : 0;
    const rMultiple = initialRisk > 0 ? pnl / initialRisk : null;

    return this.prisma.botRunnerTrade.update({
      where: { id: input.tradeId },
      data: {
        exitPrice: new Prisma.Decimal(input.exitPrice),
        closedAt: new Date(),
        fee: new Prisma.Decimal(totalFee),
        pnl: new Prisma.Decimal(pnl),
        pnlPct: new Prisma.Decimal(pnlPct),
        mae: new Prisma.Decimal(mae),
        maePct: new Prisma.Decimal(maePct),
        mfe: new Prisma.Decimal(mfe),
        mfePct: new Prisma.Decimal(mfePct),
        rMultiple:
          rMultiple === null ? undefined : new Prisma.Decimal(rMultiple),
        reason: input.reason ?? trade.reason,
      },
    });
  }

  async updateTradeExtremes(tradeId: number, price: number): Promise<void> {
    const trade = await this.prisma.botRunnerTrade.findUnique({
      where: { id: tradeId },
      select: { peakPrice: true, troughPrice: true, entryPrice: true },
    });
    if (!trade) return;
    const entry = Number(trade.entryPrice);
    const curPeak = trade.peakPrice ? Number(trade.peakPrice) : entry;
    const curTrough = trade.troughPrice ? Number(trade.troughPrice) : entry;
    const newPeak = Math.max(curPeak, price);
    const newTrough = Math.min(curTrough, price);
    if (newPeak === curPeak && newTrough === curTrough) return;
    await this.prisma.botRunnerTrade.update({
      where: { id: tradeId },
      data: {
        peakPrice: new Prisma.Decimal(newPeak),
        troughPrice: new Prisma.Decimal(newTrough),
      },
    });
  }

  async findOpenTrade(
    botRunnerRunId: number,
    symbol: string,
    side: OrderSide,
  ): Promise<BotRunnerTrade | null> {
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

  async createTrace(input: CreateTraceInput): Promise<void> {
    const payload = input.payload
      ? (JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue)
      : undefined;
    await this.prisma.botRunnerTrace.create({
      data: {
        botRunnerRunId: input.botRunnerRunId,
        correlationId: input.correlationId,
        eventType: input.eventType,
        symbol: input.symbol,
        orderId: input.orderId,
        tradeId: input.tradeId,
        payload,
      },
    });
  }

  async createExecutionMetric(
    input: CreateExecutionMetricInput,
  ): Promise<void> {
    const decimal = (value: number | undefined) =>
      value === undefined || !Number.isFinite(value)
        ? undefined
        : new Prisma.Decimal(value);
    await this.prisma.executionMetric.create({
      data: {
        botRunnerRunId: input.botRunnerRunId,
        correlationId: input.correlationId,
        orderId: input.orderId,
        exchange: input.exchange,
        mode: input.mode,
        symbol: input.symbol,
        side: input.side,
        orderType: input.orderType,
        market: input.market ?? 'SPOT',
        status: input.status,
        expectedPrice: decimal(input.expectedPrice),
        bestBid: decimal(input.bestBid),
        bestAsk: decimal(input.bestAsk),
        spreadBps: decimal(input.spreadBps),
        requestedQuantity: decimal(input.requestedQuantity),
        filledQuantity: decimal(input.filledQuantity),
        fillPrice: decimal(input.fillPrice),
        notional: decimal(input.notional),
        fee: decimal(input.fee) ?? new Prisma.Decimal(0),
        feeCurrency: input.feeCurrency,
        slippageBps: decimal(input.slippageBps),
        slippageQuote: decimal(input.slippageQuote),
        latencyMs: input.latencyMs,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        requestedAt: input.requestedAt,
        respondedAt: input.respondedAt,
      },
    });
  }

  async listRuns(
    filters: { ownerId?: number; status?: RunnerStatus; limit?: number } = {},
  ) {
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

  async listTraces(
    botRunnerRunId: number,
    filters: {
      correlationId?: string;
      eventType?: string;
      limit?: number;
    } = {},
  ) {
    return this.prisma.botRunnerTrace.findMany({
      where: {
        botRunnerRunId,
        correlationId: filters.correlationId,
        eventType: filters.eventType,
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: Math.min(filters.limit ?? 500, 2000),
    });
  }
}
