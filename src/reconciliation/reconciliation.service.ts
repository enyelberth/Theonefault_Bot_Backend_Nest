import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, PrismaClient, RunnerStatus } from '@prisma/client';
import { createHash } from 'crypto';
import type { IExchange } from '../exchanges/exchange.interface';
import type { MarketType, Order, Position } from '../exchanges/domain';
import { ExchangeSelector } from '../bot-runner/exchange-selector.service';
import { classifyOrderState, quantitiesMatch } from './reconciliation-policy';

const RECONCILIATION_INTERVAL_MS = 5 * 60 * 1000;
const ORDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface IssueInput {
  type: string;
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  entityType: string;
  entityId?: string;
  localState?: Record<string, unknown>;
  remoteState?: Record<string, unknown>;
  action?: 'AUTO_REPAIRED' | 'REQUIRES_MANUAL' | 'OBSERVED';
  resolved?: boolean;
  resolution?: string;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly activeRuns = new Set<number>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly selector: ExchangeSelector,
  ) {}

  @Interval(RECONCILIATION_INTERVAL_MS)
  async scheduledReconciliation(): Promise<void> {
    const runs = await this.prisma.botRunnerRun.findMany({
      where: { status: RunnerStatus.RUNNING },
      select: { runId: true },
    });
    for (const run of runs) {
      await this.reconcileRun(run.runId, 'SCHEDULED').catch(
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `scheduled reconciliation ${run.runId}: ${message}`,
          );
        },
      );
    }
  }

  async reconcileRun(runId: string, trigger = 'MANUAL') {
    const run = await this.prisma.botRunnerRun.findUnique({ where: { runId } });
    if (!run) throw new NotFoundException(`BotRunnerRun ${runId} not found`);
    if (this.activeRuns.has(run.id)) {
      throw new BadRequestException(
        `Reconciliation already running for ${runId}`,
      );
    }
    this.activeRuns.add(run.id);
    const exchange = this.selector.resolve({
      mode: run.exchangeMode as 'real' | 'paper',
      exchangeId: (run.exchangeId ?? undefined) as
        | 'binance'
        | 'bybit'
        | 'okx'
        | 'kraken'
        | undefined,
      paperAccountId: run.paperAccountId ?? undefined,
    });
    const batch = await this.prisma.reconciliationBatch.create({
      data: {
        botRunnerRunId: run.id,
        trigger,
        exchange: exchange.id,
        mode: run.exchangeMode,
      },
    });

    try {
      const orderResult = await this.reconcileOrders(
        run.id,
        batch.id,
        exchange,
      );
      const market = this.marketFromConfig(run.config);
      const positionResult = await this.reconcilePositions(
        run.id,
        batch.id,
        run.symbol,
        market,
        exchange,
      );
      const balanceResult = await this.captureBalances(
        run.id,
        batch.id,
        market,
        exchange,
      );
      return await this.prisma.reconciliationBatch.update({
        where: { id: batch.id },
        data: {
          status: 'COMPLETED',
          ordersChecked: orderResult.checked,
          positionsChecked: positionResult.checked,
          balancesChecked: balanceResult.checked,
          issuesFound:
            orderResult.issues + positionResult.issues + balanceResult.issues,
          repairsApplied: orderResult.repairs,
          positionSnapshot: this.json(positionResult.snapshot),
          balanceSnapshot: this.json(balanceResult.snapshot),
          completedAt: new Date(),
        },
        include: { issues: { orderBy: { severity: 'desc' } } },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.reconciliationBatch.update({
        where: { id: batch.id },
        data: {
          status: 'FAILED',
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      throw error;
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

  async listBatches(runId?: string, limit = 50) {
    this.assertLimit(limit);
    return this.prisma.reconciliationBatch.findMany({
      where: { botRunnerRun: runId ? { runId } : undefined },
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: { botRunnerRun: { select: { runId: true, symbol: true } } },
    });
  }

  async listIssues(filters: {
    runId?: string;
    status?: string;
    severity?: string;
    limit?: number;
  }) {
    const limit = filters.limit ?? 100;
    this.assertLimit(limit);
    return this.prisma.reconciliationIssue.findMany({
      where: {
        botRunnerRun: filters.runId ? { runId: filters.runId } : undefined,
        status: filters.status,
        severity: filters.severity,
      },
      orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
      take: limit,
      include: { botRunnerRun: { select: { runId: true, symbol: true } } },
    });
  }

  async resolveIssue(id: number, resolution: string) {
    if (!resolution.trim()) {
      throw new BadRequestException('resolution is required');
    }
    const issue = await this.prisma.reconciliationIssue.findUnique({
      where: { id },
    });
    if (!issue)
      throw new NotFoundException(`ReconciliationIssue ${id} not found`);
    return this.prisma.reconciliationIssue.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolution: resolution.trim(),
        resolvedAt: new Date(),
      },
    });
  }

  private async reconcileOrders(
    botRunnerRunId: number,
    batchId: number,
    exchange: IExchange,
  ): Promise<{ checked: number; issues: number; repairs: number }> {
    const executions = await this.prisma.executionMetric.findMany({
      where: {
        botRunnerRunId,
        orderId: { not: null },
        requestedAt: { gte: new Date(Date.now() - ORDER_LOOKBACK_MS) },
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
    });
    let checked = 0;
    let issues = 0;
    let repairs = 0;
    for (const local of executions) {
      if (!local.orderId) continue;
      checked += 1;
      let remote: Order;
      try {
        remote = await exchange.getOrder(
          local.symbol,
          local.orderId,
          local.market as MarketType,
        );
      } catch (error: unknown) {
        issues += 1;
        const message = error instanceof Error ? error.message : String(error);
        await this.recordIssue(botRunnerRunId, batchId, {
          type: 'ORDER_LOOKUP_FAILED',
          severity: 'WARNING',
          entityType: 'ORDER',
          entityId: local.orderId,
          localState: { status: local.status, symbol: local.symbol },
          remoteState: { error: message },
          action: 'REQUIRES_MANUAL',
        });
        continue;
      }

      const stateDecision = classifyOrderState(local.status, remote.status);
      if (stateDecision === 'MATCH') {
        await this.resolveFingerprint(
          this.fingerprint(
            botRunnerRunId,
            'ORDER_STATE_CONFLICT',
            'ORDER',
            local.orderId,
          ),
          'local and exchange order states now match',
        );
        continue;
      }

      if (stateDecision === 'AUTO_ADVANCE') {
        const fillPrice = remote.averagePrice || remote.price || undefined;
        await this.prisma.executionMetric.update({
          where: { id: local.id },
          data: {
            status: remote.status,
            filledQuantity: new Prisma.Decimal(remote.filledQuantity),
            fillPrice:
              fillPrice === undefined
                ? undefined
                : new Prisma.Decimal(fillPrice),
            notional:
              fillPrice === undefined
                ? undefined
                : new Prisma.Decimal(fillPrice * remote.filledQuantity),
            fee:
              remote.fee === undefined
                ? undefined
                : new Prisma.Decimal(remote.fee),
            feeCurrency: remote.feeCurrency,
            respondedAt: new Date(remote.updatedAt || Date.now()),
          },
        });
        repairs += 1;
        issues += 1;
        await this.recordIssue(botRunnerRunId, batchId, {
          type: 'ORDER_STATE_ADVANCED',
          severity: 'INFO',
          entityType: 'ORDER',
          entityId: local.orderId,
          localState: { status: local.status },
          remoteState: this.orderState(remote),
          action: 'AUTO_REPAIRED',
          resolved: true,
          resolution: `local execution updated to ${remote.status}`,
        });
        if (remote.status === 'FILLED') {
          const tradeTrace = await this.prisma.botRunnerTrace.findFirst({
            where: {
              botRunnerRunId,
              correlationId: local.correlationId,
              eventType: { in: ['TRADE_OPENED', 'TRADE_CLOSED'] },
            },
            select: { id: true },
          });
          if (!tradeTrace) {
            issues += 1;
            await this.recordIssue(botRunnerRunId, batchId, {
              type: 'FILLED_ORDER_WITHOUT_TRADE',
              severity: 'CRITICAL',
              entityType: 'ORDER',
              entityId: local.orderId,
              localState: {
                executionStatus: remote.status,
                tradeTrace: false,
                correlationId: local.correlationId,
              },
              remoteState: this.orderState(remote),
              action: 'REQUIRES_MANUAL',
            });
          }
        }
      } else {
        issues += 1;
        await this.recordIssue(botRunnerRunId, batchId, {
          type: 'ORDER_STATE_CONFLICT',
          severity: 'CRITICAL',
          entityType: 'ORDER',
          entityId: local.orderId,
          localState: { status: local.status },
          remoteState: this.orderState(remote),
          action: 'REQUIRES_MANUAL',
        });
      }
    }
    return { checked, issues, repairs };
  }

  private async reconcilePositions(
    botRunnerRunId: number,
    batchId: number,
    symbol: string,
    market: MarketType,
    exchange: IExchange,
  ): Promise<{ checked: number; issues: number; snapshot: unknown[] }> {
    const localTrades = await this.prisma.botRunnerTrade.findMany({
      where: { botRunnerRunId, closedAt: null },
      select: { id: true, symbol: true, side: true, quantity: true },
    });
    let positions: Position[];
    try {
      positions = await exchange.getPositions(market);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordIssue(botRunnerRunId, batchId, {
        type: 'POSITION_CHECK_UNAVAILABLE',
        severity: 'INFO',
        entityType: 'POSITION',
        entityId: symbol,
        localState: { openTrades: localTrades.length, market },
        remoteState: { error: message },
        action: 'OBSERVED',
      });
      return { checked: 0, issues: 1, snapshot: [] };
    }

    let issues = 0;
    const symbols = new Set([
      ...localTrades.map((trade) => trade.symbol),
      symbol,
    ]);
    for (const currentSymbol of symbols) {
      const local = localTrades.filter(
        (trade) => trade.symbol === currentSymbol,
      );
      const localQuantity = local.reduce(
        (sum, trade) => sum + Number(trade.quantity),
        0,
      );
      const remote = positions.find(
        (position) => position.symbol === currentSymbol,
      );
      const remoteQuantity = remote?.quantity ?? 0;
      const fingerprint = this.fingerprint(
        botRunnerRunId,
        'POSITION_QUANTITY_MISMATCH',
        'POSITION',
        currentSymbol,
      );
      if (quantitiesMatch(localQuantity, remoteQuantity)) {
        await this.resolveFingerprint(
          fingerprint,
          'local and exchange quantities now match',
        );
        continue;
      }
      issues += 1;
      await this.recordIssue(botRunnerRunId, batchId, {
        type: 'POSITION_QUANTITY_MISMATCH',
        severity:
          localQuantity > 0 && remoteQuantity === 0
            ? 'CRITICAL'
            : localQuantity === 0 && remoteQuantity > 0
              ? 'CRITICAL'
              : 'HIGH',
        entityType: 'POSITION',
        entityId: currentSymbol,
        localState: {
          quantity: localQuantity,
          tradeIds: local.map((trade) => trade.id),
        },
        remoteState: remote
          ? {
              quantity: remote.quantity,
              side: remote.side,
              entryPrice: remote.entryPrice,
            }
          : { quantity: 0, missing: true },
        action: 'REQUIRES_MANUAL',
      });
    }
    return {
      checked: positions.length,
      issues,
      snapshot: positions.map((position) => ({
        symbol: position.symbol,
        side: position.side,
        quantity: position.quantity,
        entryPrice: position.entryPrice,
        markPrice: position.markPrice,
        unrealizedPnl: position.unrealizedPnl,
        market: position.market,
      })),
    };
  }

  private async captureBalances(
    botRunnerRunId: number,
    batchId: number,
    market: MarketType,
    exchange: IExchange,
  ): Promise<{ checked: number; issues: number; snapshot: unknown[] }> {
    try {
      const account = await exchange.getBalance(market);
      return {
        checked: account.balances.length,
        issues: 0,
        snapshot: account.balances.map((balance) => ({
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          borrowed: balance.borrowed,
          interest: balance.interest,
          total: balance.total,
        })),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.recordIssue(botRunnerRunId, batchId, {
        type: 'BALANCE_CHECK_FAILED',
        severity: 'HIGH',
        entityType: 'BALANCE',
        localState: { market },
        remoteState: { error: message },
        action: 'REQUIRES_MANUAL',
      });
      return { checked: 0, issues: 1, snapshot: [] };
    }
  }

  private async recordIssue(
    botRunnerRunId: number,
    batchId: number,
    issue: IssueInput,
  ) {
    const fingerprint = this.fingerprint(
      botRunnerRunId,
      issue.type,
      issue.entityType,
      issue.entityId,
    );
    const now = new Date();
    return this.prisma.reconciliationIssue.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        batchId,
        botRunnerRunId,
        type: issue.type,
        severity: issue.severity,
        entityType: issue.entityType,
        entityId: issue.entityId,
        localState: issue.localState ? this.json(issue.localState) : undefined,
        remoteState: issue.remoteState
          ? this.json(issue.remoteState)
          : undefined,
        action: issue.action ?? 'REQUIRES_MANUAL',
        status: issue.resolved ? 'RESOLVED' : 'OPEN',
        resolution: issue.resolution,
        resolvedAt: issue.resolved ? now : undefined,
      },
      update: {
        batchId,
        severity: issue.severity,
        localState: issue.localState ? this.json(issue.localState) : undefined,
        remoteState: issue.remoteState
          ? this.json(issue.remoteState)
          : undefined,
        action: issue.action ?? 'REQUIRES_MANUAL',
        status: issue.resolved ? 'RESOLVED' : 'OPEN',
        resolution: issue.resolution,
        resolvedAt: issue.resolved ? now : null,
        occurrenceCount: { increment: 1 },
        lastSeenAt: now,
      },
    });
  }

  private async resolveFingerprint(fingerprint: string, resolution: string) {
    await this.prisma.reconciliationIssue.updateMany({
      where: { fingerprint, status: 'OPEN' },
      data: { status: 'RESOLVED', resolution, resolvedAt: new Date() },
    });
  }

  private fingerprint(
    botRunnerRunId: number,
    type: string,
    entityType: string,
    entityId?: string,
  ): string {
    return createHash('sha256')
      .update(`${botRunnerRunId}:${type}:${entityType}:${entityId ?? '-'}`)
      .digest('hex');
  }

  private orderState(order: Order): Record<string, unknown> {
    return {
      status: order.status,
      filledQuantity: order.filledQuantity,
      averagePrice: order.averagePrice,
      fee: order.fee,
      updatedAt: order.updatedAt,
    };
  }

  private marketFromConfig(config: Prisma.JsonValue): MarketType {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const market = config.market;
      if (
        market === 'SPOT' ||
        market === 'MARGIN_CROSS' ||
        market === 'MARGIN_ISOLATED' ||
        market === 'FUTURES'
      ) {
        return market;
      }
    }
    return 'SPOT';
  }

  private assertLimit(limit: number): void {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 500',
      );
    }
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
