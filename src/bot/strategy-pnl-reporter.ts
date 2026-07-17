import { Logger } from '@nestjs/common';
import { OrderSide } from '@prisma/client';
import { BotPnlService } from './bot-pnl.service';

export interface ReportTradeInput {
  externalOrderId?: string;
  side: OrderSide;
  entryPrice: number | string;
  exitPrice: number | string;
  quantity: number | string;
  fees?: number | string;
  openedAt: Date;
  closedAt?: Date;
}

export interface ReportMetricInput {
  realizedPnl?: number | string;
  unrealizedPnl?: number | string;
  openPositions?: number;
  tradesCount?: number;
  winCount?: number;
  lossCount?: number;
  lastPrice?: number | string;
  extra?: Record<string, any>;
}

/**
 * Wrapper por estrategia: sabe su botRunId y symbol.
 * Estrategias reciben este objeto y reportan sin conocer prisma.
 */
export class StrategyPnlReporter {
  private readonly logger = new Logger(StrategyPnlReporter.name);

  constructor(
    private readonly pnl: BotPnlService,
    private readonly botRunId: number,
    private readonly symbol: string,
  ) {}

  getBotRunId(): number {
    return this.botRunId;
  }

  async reportTrade(input: ReportTradeInput): Promise<void> {
    try {
      await this.pnl.recordTradeResult({
        botRunId: this.botRunId,
        symbol: this.symbol,
        externalOrderId: input.externalOrderId,
        side: input.side,
        entryPrice: input.entryPrice,
        exitPrice: input.exitPrice,
        quantity: input.quantity,
        fees: input.fees,
        openedAt: input.openedAt,
        closedAt: input.closedAt,
      });
    } catch (err) {
      this.logger.error(
        `reportTrade failed for botRun ${this.botRunId}`,
        err as Error,
      );
    }
  }

  async snapshotMetric(input: ReportMetricInput): Promise<void> {
    try {
      await this.pnl.recordMetric({
        botRunId: this.botRunId,
        realizedPnl: input.realizedPnl,
        unrealizedPnl: input.unrealizedPnl,
        openPositions: input.openPositions,
        tradesCount: input.tradesCount,
        winCount: input.winCount,
        lossCount: input.lossCount,
        lastPrice: input.lastPrice,
        extra: input.extra,
      });
    } catch (err) {
      this.logger.error(
        `snapshotMetric failed for botRun ${this.botRunId}`,
        err as Error,
      );
    }
  }
}
