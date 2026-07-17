import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  BotMetric,
  BotRun,
  BotRunStatus,
  OrderSide,
  Prisma,
  PrismaClient,
  TradeResult,
} from '@prisma/client';

export interface StartBotRunInput {
  strategyId: string;
  symbol: string;
  strategyType?: string;
  initialQuote?: number | string;
  configSnapshot?: Prisma.InputJsonValue;
}

export interface RecordMetricInput {
  botRunId: number;
  realizedPnl?: number | string;
  unrealizedPnl?: number | string;
  openPositions?: number;
  tradesCount?: number;
  winCount?: number;
  lossCount?: number;
  lastPrice?: number | string;
  extra?: Prisma.InputJsonValue;
}

export interface RecordTradeResultInput {
  botRunId: number;
  externalOrderId?: string;
  symbol: string;
  side: OrderSide;
  entryPrice: number | string;
  exitPrice: number | string;
  quantity: number | string;
  fees?: number | string;
  openedAt: Date;
  closedAt?: Date;
}

export interface BotRunSummary {
  botRunId: number;
  symbol: string;
  strategyId: string;
  strategyType: string | null;
  status: BotRunStatus;
  startedAt: Date;
  stoppedAt: Date | null;
  initialQuote: string | null;
  configSnapshot: unknown;
  realizedPnl: string;
  grossProfit: string;
  grossLoss: string;
  feesTotal: string;
  tradesCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  openOrders: number;
  filledOrders: number;
  canceledOrders: number;
  buyQtyFilled: string;
  sellQtyFilled: string;
  buyNotionalFilled: string;
  sellNotionalFilled: string;
  avgBuyPrice: string;
  outstandingQty: string;
  elapsedMs: number;
}

@Injectable()
export class BotPnlService {
  private readonly logger = new Logger(BotPnlService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async startBotRun(input: StartBotRunInput): Promise<BotRun> {
    try {
      return await this.prisma.botRun.create({
        data: {
          strategyId: input.strategyId,
          symbol: input.symbol,
          strategyType: input.strategyType,
          initialQuote:
            input.initialQuote !== undefined
              ? new Prisma.Decimal(input.initialQuote)
              : undefined,
          configSnapshot: input.configSnapshot,
          status: BotRunStatus.RUNNING,
        },
      });
    } catch (error) {
      this.logger.error('Error creating BotRun', error);
      throw new InternalServerErrorException('No se pudo crear BotRun.');
    }
  }

  async stopBotRun(
    botRunId: number,
    status: BotRunStatus = BotRunStatus.STOPPED,
    errorMessage?: string,
  ): Promise<BotRun> {
    try {
      return await this.prisma.botRun.update({
        where: { id: botRunId },
        data: {
          status,
          stoppedAt: new Date(),
          errorMessage,
        },
      });
    } catch (error) {
      this.logger.error(`Error stopping BotRun ${botRunId}`, error);
      throw new InternalServerErrorException('No se pudo detener BotRun.');
    }
  }

  async findActiveBotRun(
    strategyId: string,
    symbol: string,
  ): Promise<BotRun | null> {
    return this.prisma.botRun.findFirst({
      where: {
        strategyId,
        symbol,
        status: BotRunStatus.RUNNING,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async recordMetric(input: RecordMetricInput): Promise<BotMetric> {
    try {
      return await this.prisma.botMetric.create({
        data: {
          botRunId: input.botRunId,
          realizedPnl:
            input.realizedPnl !== undefined
              ? new Prisma.Decimal(input.realizedPnl)
              : undefined,
          unrealizedPnl:
            input.unrealizedPnl !== undefined
              ? new Prisma.Decimal(input.unrealizedPnl)
              : undefined,
          openPositions: input.openPositions,
          tradesCount: input.tradesCount,
          winCount: input.winCount,
          lossCount: input.lossCount,
          lastPrice:
            input.lastPrice !== undefined
              ? new Prisma.Decimal(input.lastPrice)
              : undefined,
          extra: input.extra,
        },
      });
    } catch (error) {
      this.logger.error('Error recording BotMetric', error);
      throw new InternalServerErrorException('No se pudo registrar métrica.');
    }
  }

  async recordTradeResult(
    input: RecordTradeResultInput,
  ): Promise<TradeResult> {
    try {
      const entry = new Prisma.Decimal(input.entryPrice);
      const exit = new Prisma.Decimal(input.exitPrice);
      const qty = new Prisma.Decimal(input.quantity);
      const fees = new Prisma.Decimal(input.fees ?? 0);

      const direction = input.side === OrderSide.BUY ? 1 : -1;
      const grossPnl = exit.minus(entry).mul(qty).mul(direction);
      const pnl = grossPnl.minus(fees);
      const denom = entry.mul(qty);
      const pnlPct = denom.isZero()
        ? new Prisma.Decimal(0)
        : pnl.div(denom).mul(100);

      return await this.prisma.tradeResult.create({
        data: {
          botRunId: input.botRunId,
          externalOrderId: input.externalOrderId,
          symbol: input.symbol,
          side: input.side,
          entryPrice: entry,
          exitPrice: exit,
          quantity: qty,
          fees,
          pnl,
          pnlPct,
          openedAt: input.openedAt,
          closedAt: input.closedAt ?? new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Error recording TradeResult', error);
      throw new InternalServerErrorException(
        'No se pudo registrar resultado de trade.',
      );
    }
  }

  async getBotRunSummary(botRunId: number): Promise<BotRunSummary> {
    const run = await this.prisma.botRun.findUnique({
      where: { id: botRunId },
    });
    if (!run) {
      throw new BadRequestException(`BotRun ${botRunId} no existe.`);
    }

    const [agg, feesAgg, grossProfitAgg, grossLossAgg, winCount, lossCount, openOrders, filledOrders, canceledOrders] = await Promise.all([
      this.prisma.tradeResult.aggregate({
        where: { botRunId },
        _sum: { pnl: true },
        _count: { _all: true },
      }),
      this.prisma.tradeResult.aggregate({
        where: { botRunId },
        _sum: { fees: true },
      }),
      this.prisma.tradeResult.aggregate({
        where: { botRunId, pnl: { gt: 0 } },
        _sum: { pnl: true },
      }),
      this.prisma.tradeResult.aggregate({
        where: { botRunId, pnl: { lt: 0 } },
        _sum: { pnl: true },
      }),
      this.prisma.tradeResult.count({ where: { botRunId, pnl: { gt: 0 } } }),
      this.prisma.tradeResult.count({ where: { botRunId, pnl: { lte: 0 } } }),
      this.prisma.paperOrder.count({ where: { botRunId, status: 'OPEN' } }),
      this.prisma.paperOrder.count({ where: { botRunId, status: 'FILLED' } }),
      this.prisma.paperOrder.count({ where: { botRunId, status: 'CANCELED' } }),
    ]);

    const tradesCount = agg._count._all;
    const winRate = tradesCount === 0 ? 0 : (winCount / tradesCount) * 100;
    const now = run.stoppedAt ? run.stoppedAt.getTime() : Date.now();
    const elapsedMs = now - run.startedAt.getTime();
    const grossLossValue = grossLossAgg._sum.pnl ?? new Prisma.Decimal(0);

    const filledOrdersRaw = await this.prisma.paperOrder.findMany({
      where: { botRunId, status: 'FILLED' },
      select: { side: true, quantity: true, filledPrice: true, price: true },
    });
    let buyQty = new Prisma.Decimal(0);
    let sellQty = new Prisma.Decimal(0);
    let buyNotional = new Prisma.Decimal(0);
    let sellNotional = new Prisma.Decimal(0);
    for (const o of filledOrdersRaw) {
      const qty = o.quantity ?? new Prisma.Decimal(0);
      const price = o.filledPrice ?? o.price ?? new Prisma.Decimal(0);
      const notional = qty.mul(price);
      if (o.side === 'BUY') {
        buyQty = buyQty.plus(qty);
        buyNotional = buyNotional.plus(notional);
      } else {
        sellQty = sellQty.plus(qty);
        sellNotional = sellNotional.plus(notional);
      }
    }
    const avgBuyPrice = buyQty.gt(0) ? buyNotional.div(buyQty) : new Prisma.Decimal(0);
    const outstandingQty = buyQty.minus(sellQty);

    return {
      botRunId: run.id,
      symbol: run.symbol,
      strategyId: run.strategyId,
      strategyType: run.strategyType,
      status: run.status,
      startedAt: run.startedAt,
      stoppedAt: run.stoppedAt,
      initialQuote: run.initialQuote?.toString() ?? null,
      configSnapshot: run.configSnapshot,
      realizedPnl: (agg._sum.pnl ?? new Prisma.Decimal(0)).toString(),
      grossProfit: (grossProfitAgg._sum.pnl ?? new Prisma.Decimal(0)).toString(),
      grossLoss: grossLossValue.abs().toString(),
      feesTotal: (feesAgg._sum.fees ?? new Prisma.Decimal(0)).toString(),
      tradesCount,
      winCount,
      lossCount,
      winRate,
      openOrders,
      filledOrders,
      canceledOrders,
      buyQtyFilled: buyQty.toString(),
      sellQtyFilled: sellQty.toString(),
      buyNotionalFilled: buyNotional.toString(),
      sellNotionalFilled: sellNotional.toString(),
      avgBuyPrice: avgBuyPrice.toString(),
      outstandingQty: outstandingQty.toString(),
      elapsedMs,
    };
  }

  async listActiveBotRuns(): Promise<BotRun[]> {
    return this.prisma.botRun.findMany({
      where: { status: BotRunStatus.RUNNING },
      orderBy: { startedAt: 'desc' },
    });
  }

  async listBotRunMetrics(
    botRunId: number,
    limit = 100,
  ): Promise<BotMetric[]> {
    return this.prisma.botMetric.findMany({
      where: { botRunId },
      orderBy: { ts: 'desc' },
      take: limit,
    });
  }

  async listTradeResults(
    botRunId: number,
    limit = 100,
  ): Promise<TradeResult[]> {
    return this.prisma.tradeResult.findMany({
      where: { botRunId },
      orderBy: { closedAt: 'desc' },
      take: limit,
    });
  }
}
