import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { OrderSide, OrderStatus, OrderType, Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { StrategyRuntimeContext } from './strategy-runtime-context.service';
import { PnlLedgerService } from 'src/pnl-ledger/pnl-ledger.service';

type MarketScope = 'spot' | 'margin';

interface OrderPlacementMeta {
  strategyId: string;
  strategyType: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  market: MarketScope;
  quantity: number;
  requestedPrice?: number;
  orderId: number;
  clientOrderId: string;
  accountId?: number;
  createdAt: string;
}

interface StrategyStats {
  strategyId: string;
  strategyType: string;
  symbol: string;
  totalOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  rejectedOrders: number;
  openLots: number;
  realizedPnl: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  updatedAt: string;
}

interface RiskSettings {
  maxOpenPositions: number;
  maxDailyLoss: number;
  maxNotionalPerOrder: number;
  cooldownMsAfterLoss: number;
}

interface OpenLot {
  qty: number;
  price: number;
  orderId: number;
}

export interface PendingLiquidation {
  strategyId: string;
  strategyType: string;
  symbol: string;
  market: MarketScope;
  reason: 'maxDailyLoss';
  threshold: number;
  currentDailyPnl: number;
  triggeredAt: string;
}

@Injectable()
export class StrategyOpsService implements OnModuleInit {
  private readonly logger = new Logger(StrategyOpsService.name);
  private readonly placements = new Map<number, OrderPlacementMeta>();
  private readonly lotBook = new Map<string, OpenLot[]>();
  private readonly stats = new Map<string, StrategyStats>();
  private readonly dailyPnl = new Map<string, { day: string; value: number }>();
  private readonly lastLossAt = new Map<string, number>();
  private readonly processedFills = new Set<number>();
  private readonly executionLog: Array<Record<string, unknown>> = [];
  private readonly riskCache = new Map<string, RiskSettings>();
  private readonly pendingLiquidations = new Map<string, PendingLiquidation>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pnlLedger: PnlLedgerService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureEventLogTable();
      await this.seedStatsFromDb();
    } catch (error) {
      this.logger.warn(
        `No se pudo inicializar strategy_ops: ${(error as Error).message}`,
      );
    }
  }

  private async seedStatsFromDb(): Promise<void> {
    try {
      const stats =
        (await (this.prisma as any).strategyStatSnapshot?.findMany?.()) || [];
      for (const stat of stats) {
        this.stats.set(stat.strategyId, {
          strategyId: stat.strategyId,
          strategyType: '',
          symbol: '',
          totalOrders: stat.totalOrders,
          filledOrders: stat.filledOrders,
          cancelledOrders: stat.cancelledOrders,
          rejectedOrders: 0,
          openLots: 0,
          realizedPnl:
            typeof stat.realizedPnl === 'number'
              ? stat.realizedPnl
              : stat.realizedPnl.toNumber?.() || 0,
          winningTrades: stat.winningTrades,
          losingTrades: stat.losingTrades,
          winRate:
            typeof stat.winRate === 'number'
              ? stat.winRate
              : stat.winRate.toNumber?.() || 0,
          updatedAt:
            stat.updatedAt?.toISOString?.() || new Date().toISOString(),
        });
      }
      this.logger.log(`Seeded ${stats.length} strategy stats from DB`);
    } catch (error) {
      this.logger.warn(
        `Could not seed stats from DB: ${(error as Error).message}`,
      );
    }
  }

  private async ensureEventLogTable(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS strategy_event_log (
        id BIGSERIAL PRIMARY KEY,
        strategy_id TEXT,
        symbol TEXT,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_strategy_event_log_strategy_time ON strategy_event_log(strategy_id, created_at DESC);',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_strategy_event_log_symbol_time ON strategy_event_log(symbol, created_at DESC);',
    );
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS idx_strategy_event_log_type_time ON strategy_event_log(event_type, created_at DESC);',
    );
  }

  private async persistEvent(event: Record<string, unknown>): Promise<void> {
    const eventType = String(event.event ?? 'EVENT');
    const strategyId = event.strategyId ? String(event.strategyId) : null;
    const symbol = event.symbol ? String(event.symbol) : null;

    try {
      await this.prisma.$executeRaw`
        INSERT INTO strategy_event_log (strategy_id, symbol, event_type, payload)
        VALUES (${strategyId}, ${symbol}, ${eventType}, ${event}::jsonb)
      `;
    } catch (error) {
      this.logger.warn(
        `No se pudo persistir evento ${eventType}: ${(error as Error).message}`,
      );
    }
  }

  private getRiskSettings(context: StrategyRuntimeContext): RiskSettings {
    const raw = (context.config?.risk ?? {}) as Record<string, unknown>;

    return {
      maxOpenPositions: Number(raw.maxOpenPositions ?? 3),
      maxDailyLoss: Number(raw.maxDailyLoss ?? 150),
      maxNotionalPerOrder: Number(raw.maxNotionalPerOrder ?? 2000),
      cooldownMsAfterLoss: Number(raw.cooldownMsAfterLoss ?? 30000),
    };
  }

  private ensureStrategyStats(context: StrategyRuntimeContext): StrategyStats {
    const current = this.stats.get(context.strategyId);
    if (current) {
      return current;
    }

    const created: StrategyStats = {
      strategyId: context.strategyId,
      strategyType: context.strategyType,
      symbol: context.symbol,
      totalOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      rejectedOrders: 0,
      openLots: 0,
      realizedPnl: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      updatedAt: new Date().toISOString(),
    };

    this.stats.set(context.strategyId, created);
    return created;
  }

  private pushLog(event: Record<string, unknown>) {
    this.executionLog.unshift({
      ...event,
      timestamp: new Date().toISOString(),
    });
    if (this.executionLog.length > 2000) {
      this.executionLog.pop();
    }

    void this.persistEvent(event);
  }

  private getContextConfigNumber(
    context: StrategyRuntimeContext,
    key: string,
  ): number | undefined {
    const value = context.config?.[key];
    if (value === undefined || value === null) {
      return undefined;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  }

  buildClientOrderId(
    context: StrategyRuntimeContext,
    side: 'BUY' | 'SELL',
    market: MarketScope,
  ): string {
    const compactId =
      context.strategyId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'strat';
    const sideShort = side === 'BUY' ? 'b' : 's';
    const marketShort = market === 'margin' ? 'm' : 's';
    return `${marketShort}_${compactId}_${sideShort}_${Date.now().toString(36)}`.slice(
      0,
      35,
    );
  }

  assertRisk(
    context: StrategyRuntimeContext,
    side: 'BUY' | 'SELL',
    quantity: number,
    price?: number,
  ): void {
    const settings = this.getRiskSettings(context);
    this.riskCache.set(context.strategyId, settings);
    const stats = this.ensureStrategyStats(context);

    const openLots = this.lotBook.get(context.strategyId) ?? [];
    const notional = (price ?? 0) * quantity;

    if (side === 'BUY' && openLots.length >= settings.maxOpenPositions) {
      this.pushLog({
        event: 'RISK_BLOCKED',
        strategyId: context.strategyId,
        symbol: context.symbol,
        side,
        reason: 'maxOpenPositions',
        maxOpenPositions: settings.maxOpenPositions,
      });
      throw new BadRequestException(
        `RiskManager: maxOpenPositions alcanzado (${settings.maxOpenPositions}) para ${context.strategyId}`,
      );
    }

    if (price && notional > settings.maxNotionalPerOrder) {
      this.pushLog({
        event: 'RISK_BLOCKED',
        strategyId: context.strategyId,
        symbol: context.symbol,
        side,
        reason: 'maxNotionalPerOrder',
        maxNotionalPerOrder: settings.maxNotionalPerOrder,
        notional,
      });
      throw new BadRequestException(
        `RiskManager: notional por orden excede limite (${settings.maxNotionalPerOrder}) para ${context.strategyId}`,
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const daySnapshot = this.dailyPnl.get(context.strategyId) ?? {
      day: today,
      value: 0,
    };
    const normalized =
      daySnapshot.day === today ? daySnapshot : { day: today, value: 0 };
    this.dailyPnl.set(context.strategyId, normalized);

    if (normalized.value <= -Math.abs(settings.maxDailyLoss)) {
      this.pushLog({
        event: 'RISK_BLOCKED',
        strategyId: context.strategyId,
        symbol: context.symbol,
        side,
        reason: 'maxDailyLoss',
        maxDailyLoss: settings.maxDailyLoss,
        currentDailyPnl: normalized.value,
      });
      throw new BadRequestException(
        `RiskManager: perdida diaria maxima alcanzada (${settings.maxDailyLoss}) para ${context.strategyId}`,
      );
    }

    const lastLoss = this.lastLossAt.get(context.strategyId);
    if (
      lastLoss &&
      Date.now() - lastLoss < settings.cooldownMsAfterLoss &&
      side === 'BUY'
    ) {
      this.pushLog({
        event: 'RISK_BLOCKED',
        strategyId: context.strategyId,
        symbol: context.symbol,
        side,
        reason: 'cooldownMsAfterLoss',
        cooldownMsAfterLoss: settings.cooldownMsAfterLoss,
      });
      throw new BadRequestException(
        `RiskManager: cooldown activo para ${context.strategyId}`,
      );
    }

    stats.openLots = openLots.length;
    stats.updatedAt = new Date().toISOString();
  }

  async recordOrderPlacement(
    context: StrategyRuntimeContext,
    placement: {
      side: 'BUY' | 'SELL';
      type: 'LIMIT' | 'MARKET';
      market: MarketScope;
      quantity: number;
      requestedPrice?: number;
      response: Record<string, unknown>;
    },
  ): Promise<void> {
    const orderId = Number(placement.response.orderId);
    if (!Number.isFinite(orderId)) {
      return;
    }

    const clientOrderId = String(
      placement.response.clientOrderId ??
        placement.response.clientOrder_id ??
        '',
    );
    const accountId = this.getContextConfigNumber(context, 'accountId');

    const meta: OrderPlacementMeta = {
      strategyId: context.strategyId,
      strategyType: context.strategyType,
      symbol: context.symbol,
      side: placement.side,
      type: placement.type,
      market: placement.market,
      quantity: placement.quantity,
      requestedPrice: placement.requestedPrice,
      orderId,
      clientOrderId,
      accountId,
      createdAt: new Date().toISOString(),
    };

    this.placements.set(orderId, meta);

    const stats = this.ensureStrategyStats(context);
    stats.totalOrders += 1;
    stats.updatedAt = new Date().toISOString();

    this.pushLog({
      event: 'ORDER_PLACED',
      strategyId: context.strategyId,
      symbol: context.symbol,
      orderId,
      side: placement.side,
      type: placement.type,
      market: placement.market,
      quantity: placement.quantity,
      requestedPrice: placement.requestedPrice,
    });

    await this.persistOrder(meta, placement.response, 'OPEN');
  }

  async recordOrderStatus(
    symbol: string,
    payload: Record<string, unknown>,
    market: MarketScope,
    context?: StrategyRuntimeContext,
  ): Promise<PendingLiquidation | null> {
    const orderId = Number(payload.orderId);
    if (!Number.isFinite(orderId)) {
      return null;
    }

    const status = String(payload.status ?? '').toUpperCase();
    const side = String(payload.side ?? 'BUY').toUpperCase() as 'BUY' | 'SELL';

    let placement = this.placements.get(orderId);
    if (!placement && context) {
      placement = {
        strategyId: context.strategyId,
        strategyType: context.strategyType,
        symbol,
        side,
        type:
          String(payload.type ?? 'LIMIT').toUpperCase() === 'MARKET'
            ? 'MARKET'
            : 'LIMIT',
        market,
        quantity: Number(payload.origQty ?? payload.executedQty ?? 0),
        requestedPrice: Number(payload.price ?? 0) || undefined,
        orderId,
        clientOrderId: String(payload.clientOrderId ?? ''),
        accountId: this.getContextConfigNumber(context, 'accountId'),
        createdAt: new Date().toISOString(),
      };
      this.placements.set(orderId, placement);
    }

    if (!placement) {
      return null;
    }

    let liquidationTrigger: PendingLiquidation | null = null;

    if (status === 'FILLED' && !this.processedFills.has(orderId)) {
      this.processedFills.add(orderId);
      liquidationTrigger = await this.handleFilledOrder(placement, payload);
    }

    if (
      status === 'CANCELED' ||
      status === 'REJECTED' ||
      status === 'EXPIRED'
    ) {
      const stats = this.stats.get(placement.strategyId);
      if (stats) {
        if (status === 'CANCELED' || status === 'EXPIRED') {
          stats.cancelledOrders += 1;
        }
        if (status === 'REJECTED') {
          stats.rejectedOrders += 1;
        }
        stats.updatedAt = new Date().toISOString();
      }
    }

    this.pushLog({
      event: 'ORDER_STATUS',
      strategyId: placement.strategyId,
      symbol,
      orderId,
      status,
      side,
      market,
    });

    await this.persistOrder(placement, payload, this.mapStatus(status));
    return liquidationTrigger;
  }

  private async handleFilledOrder(
    placement: OrderPlacementMeta,
    payload: Record<string, unknown>,
  ): Promise<PendingLiquidation | null> {
    const stats = this.stats.get(placement.strategyId) ?? {
      strategyId: placement.strategyId,
      strategyType: placement.strategyType,
      symbol: placement.symbol,
      totalOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      rejectedOrders: 0,
      openLots: 0,
      realizedPnl: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      updatedAt: new Date().toISOString(),
    };

    const executedQty = Number(payload.executedQty ?? placement.quantity ?? 0);
    const avgPrice = Number(
      payload.avgPrice ?? payload.price ?? placement.requestedPrice ?? 0,
    );

    const lots = this.lotBook.get(placement.strategyId) ?? [];

    let realizedPnl = 0;
    if (placement.side === 'BUY') {
      await this.pnlLedger.recordOpenLot(
        placement.strategyId,
        placement.symbol,
        placement.orderId,
        new Prisma.Decimal(executedQty),
        new Prisma.Decimal(avgPrice),
      );
      lots.push({
        qty: executedQty,
        price: avgPrice,
        orderId: placement.orderId,
      });
      this.lotBook.set(placement.strategyId, lots);
    }

    if (placement.side === 'SELL' && executedQty > 0) {
      const matchResult = await this.pnlLedger.matchAndCloseLot(
        placement.strategyId,
        placement.symbol,
        placement.orderId,
        new Prisma.Decimal(avgPrice),
        new Prisma.Decimal(executedQty),
        new Prisma.Decimal(0),
      );

      realizedPnl = matchResult.realizedPnl.toNumber();

      let remaining = executedQty;
      while (remaining > 0 && lots.length > 0) {
        const head = lots[0];
        const matched = Math.min(head.qty, remaining);
        head.qty -= matched;
        remaining -= matched;
        if (head.qty <= 0) {
          lots.shift();
        }
      }
      this.lotBook.set(placement.strategyId, lots);

      stats.realizedPnl += realizedPnl;
      if (realizedPnl > 0) {
        stats.winningTrades += 1;
      } else if (realizedPnl < 0) {
        stats.losingTrades += 1;
        this.lastLossAt.set(placement.strategyId, Date.now());
      }

      const day = new Date().toISOString().slice(0, 10);
      const daySnapshot = this.dailyPnl.get(placement.strategyId) ?? {
        day,
        value: 0,
      };
      const normalized =
        daySnapshot.day === day ? daySnapshot : { day, value: 0 };
      normalized.value += realizedPnl;
      this.dailyPnl.set(placement.strategyId, normalized);

      const settings = this.riskCache.get(placement.strategyId) ?? {
        maxOpenPositions: 3,
        maxDailyLoss: 150,
        maxNotionalPerOrder: 2000,
        cooldownMsAfterLoss: 30000,
      };

      if (
        normalized.value <= -Math.abs(settings.maxDailyLoss) &&
        !this.pendingLiquidations.has(placement.strategyId)
      ) {
        const trigger: PendingLiquidation = {
          strategyId: placement.strategyId,
          strategyType: placement.strategyType,
          symbol: placement.symbol,
          market: placement.market,
          reason: 'maxDailyLoss',
          threshold: Math.abs(settings.maxDailyLoss),
          currentDailyPnl: normalized.value,
          triggeredAt: new Date().toISOString(),
        };

        this.pendingLiquidations.set(placement.strategyId, trigger);
        this.pushLog({
          event: 'RISK_LIQUIDATION_TRIGGERED',
          strategyId: trigger.strategyId,
          symbol: trigger.symbol,
          market: trigger.market,
          reason: trigger.reason,
          threshold: trigger.threshold,
          currentDailyPnl: trigger.currentDailyPnl,
        });
      }
    }

    stats.filledOrders += 1;
    stats.openLots = lots.length;
    const totalClosed = stats.winningTrades + stats.losingTrades;
    stats.winRate =
      totalClosed > 0
        ? Number(((stats.winningTrades / totalClosed) * 100).toFixed(2))
        : 0;
    stats.updatedAt = new Date().toISOString();
    this.stats.set(placement.strategyId, stats);

    await this.pnlLedger.persistStrategyStats(placement.strategyId, {
      totalOrders: stats.totalOrders,
      filledOrders: stats.filledOrders,
      cancelledOrders: stats.cancelledOrders,
      realizedPnl: new Prisma.Decimal(stats.realizedPnl),
      winningTrades: stats.winningTrades,
      losingTrades: stats.losingTrades,
      winRate: new Prisma.Decimal(stats.winRate / 100),
    });

    this.pushLog({
      event: 'ORDER_FILLED',
      strategyId: placement.strategyId,
      symbol: placement.symbol,
      orderId: placement.orderId,
      side: placement.side,
      avgPrice,
      executedQty,
      realizedPnl,
    });

    await this.persistExecution(placement, avgPrice, executedQty, realizedPnl);

    return this.consumePendingLiquidation(placement.strategyId);
  }

  consumePendingLiquidation(strategyId: string): PendingLiquidation | null {
    const pending = this.pendingLiquidations.get(strategyId);
    if (!pending) {
      return null;
    }

    this.pendingLiquidations.delete(strategyId);
    return pending;
  }

  private mapStatus(status: string): OrderStatus {
    switch (status) {
      case 'NEW':
        return OrderStatus.OPEN;
      case 'PARTIALLY_FILLED':
        return OrderStatus.PARTIALLY_FILLED;
      case 'FILLED':
        return OrderStatus.FILLED;
      case 'CANCELED':
      case 'EXPIRED':
        return OrderStatus.CANCELED;
      case 'REJECTED':
        return OrderStatus.CLOSED;
      default:
        return OrderStatus.OPEN;
    }
  }

  private async persistOrder(
    meta: OrderPlacementMeta,
    payload: Record<string, unknown>,
    status: OrderStatus,
  ): Promise<void> {
    if (!meta.accountId || meta.accountId <= 0) {
      return;
    }

    const price = Number(payload.price ?? meta.requestedPrice ?? 0);
    const origQty = Number(payload.origQty ?? meta.quantity ?? 0);
    const executedQty = Number(payload.executedQty ?? 0);

    try {
      await this.prisma.tradingOrder.upsert({
        where: { orderId: meta.orderId },
        update: {
          status,
          price: price > 0 ? new Prisma.Decimal(price) : undefined,
          quantityExecuted: new Prisma.Decimal(executedQty || 0),
          quantity: new Prisma.Decimal(origQty || meta.quantity),
          updatedAt: new Date(),
        },
        create: {
          accountId: meta.accountId,
          symbol: meta.symbol,
          orderId: meta.orderId,
          client_order_id:
            meta.clientOrderId || `${meta.strategyId}-${meta.orderId}`,
          side: meta.side === 'BUY' ? OrderSide.BUY : OrderSide.SELL,
          type: meta.type === 'MARKET' ? OrderType.MARKET : OrderType.LIMIT,
          status,
          price: price > 0 ? new Prisma.Decimal(price) : undefined,
          quantity: new Prisma.Decimal(origQty || meta.quantity),
          quantityExecuted: new Prisma.Decimal(executedQty || 0),
        },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo persistir orden ${meta.orderId}: ${(error as Error).message}`,
      );
    }
  }

  private async persistExecution(
    meta: OrderPlacementMeta,
    avgPrice: number,
    qty: number,
    realizedPnl: number,
  ): Promise<void> {
    if (!meta.accountId || meta.accountId <= 0) {
      return;
    }

    try {
      await this.prisma.tradingExecution.create({
        data: {
          orderId: meta.orderId,
          tradePrice: new Prisma.Decimal(avgPrice || 0),
          tradeQuantity: new Prisma.Decimal(qty || 0),
          tradeTimestamp: new Date(),
        },
      });

      if (meta.side === 'SELL') {
        await this.prisma.tradingOrder.update({
          where: { orderId: meta.orderId },
          data: {
            profit_loss: new Prisma.Decimal(realizedPnl || 0),
            status: OrderStatus.CLOSED,
            closed_time: new Date(),
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo persistir ejecución de orden ${meta.orderId}: ${(error as Error).message}`,
      );
    }
  }

  getExecutionLog(strategyId?: string, symbol?: string) {
    return this.executionLog.filter((item) => {
      if (strategyId && item.strategyId !== strategyId) {
        return false;
      }
      if (symbol && item.symbol !== symbol) {
        return false;
      }
      return true;
    });
  }

  getStrategyStats(strategyId?: string) {
    const values = Array.from(this.stats.values());
    if (!strategyId) {
      return values;
    }
    return values.find((item) => item.strategyId === strategyId) ?? null;
  }

  async getStrategyPerformanceHistory(
    strategyId?: string,
    from?: string,
    to?: string,
  ) {
    const clauses: Prisma.Sql[] = [];

    if (strategyId) {
      clauses.push(Prisma.sql`strategy_id = ${strategyId}`);
    }

    const fromDate = from ? new Date(from) : undefined;
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      clauses.push(Prisma.sql`created_at >= ${fromDate}`);
    }

    const toDate = to ? new Date(to) : undefined;
    if (toDate && !Number.isNaN(toDate.getTime())) {
      clauses.push(Prisma.sql`created_at <= ${toDate}`);
    }

    const whereSql =
      clauses.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`
        : Prisma.empty;

    type EventRow = {
      strategy_id: string | null;
      created_at: Date;
      event_type: string;
      payload: Prisma.JsonValue;
    };

    const rows = await this.prisma.$queryRaw<EventRow[]>(Prisma.sql`
      SELECT strategy_id, created_at, event_type, payload
      FROM strategy_event_log
      ${whereSql}
      ORDER BY created_at ASC
      LIMIT 10000
    `);

    const timelineMap = new Map<
      string,
      {
        orders: number;
        fills: number;
        wins: number;
        losses: number;
        dailyPnl: number;
      }
    >();

    for (const row of rows) {
      const day = row.created_at.toISOString().slice(0, 10);
      const bucket = timelineMap.get(day) ?? {
        orders: 0,
        fills: 0,
        wins: 0,
        losses: 0,
        dailyPnl: 0,
      };

      if (row.event_type === 'ORDER_PLACED') {
        bucket.orders += 1;
      }

      if (row.event_type === 'ORDER_FILLED') {
        bucket.fills += 1;
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const pnl = Number(payload.realizedPnl ?? 0);
        if (Number.isFinite(pnl)) {
          bucket.dailyPnl += pnl;
          if (pnl > 0) {
            bucket.wins += 1;
          } else if (pnl < 0) {
            bucket.losses += 1;
          }
        }
      }

      timelineMap.set(day, bucket);
    }

    let cumulativePnl = 0;
    const timeline = Array.from(timelineMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, item]) => {
        cumulativePnl += item.dailyPnl;
        return {
          day,
          ...item,
          cumulativePnl: Number(cumulativePnl.toFixed(8)),
        };
      });

    return {
      strategyId: strategyId ?? null,
      from: from ?? null,
      to: to ?? null,
      events: rows.length,
      timeline,
    };
  }

  async getStrategyDashboard(strategyId?: string) {
    type DashboardRow = {
      strategy_id: string | null;
      orders: bigint;
      fills: bigint;
      cancelled: bigint;
      rejected: bigint;
      realized_pnl: number | null;
    };

    const rows = await this.prisma.$queryRaw<DashboardRow[]>(Prisma.sql`
      SELECT
        strategy_id,
        COUNT(*) FILTER (WHERE event_type = 'ORDER_PLACED') AS orders,
        COUNT(*) FILTER (WHERE event_type = 'ORDER_FILLED') AS fills,
        COUNT(*) FILTER (WHERE event_type = 'ORDER_STATUS' AND ((payload->>'status') IN ('CANCELED', 'EXPIRED'))) AS cancelled,
        COUNT(*) FILTER (WHERE event_type = 'ORDER_STATUS' AND (payload->>'status') = 'REJECTED') AS rejected,
        COALESCE(SUM(
          CASE
            WHEN event_type = 'ORDER_FILLED' THEN COALESCE((payload->>'realizedPnl')::double precision, 0)
            ELSE 0
          END
        ), 0) AS realized_pnl
      FROM strategy_event_log
      WHERE (${strategyId}::text IS NULL OR strategy_id = ${strategyId})
      GROUP BY strategy_id
      ORDER BY strategy_id ASC
    `);

    const runtimeByStrategy = new Map(
      Array.from(this.stats.values()).map((item) => [item.strategyId, item]),
    );

    const strategies = rows.map((row) => {
      const id = row.strategy_id ?? 'unknown';
      const runtime = runtimeByStrategy.get(id);
      return {
        strategyId: id,
        orders: Number(row.orders),
        fills: Number(row.fills),
        cancelled: Number(row.cancelled),
        rejected: Number(row.rejected),
        realizedPnl: Number(row.realized_pnl ?? 0),
        openLots: runtime?.openLots ?? 0,
        winRate: runtime?.winRate ?? 0,
        symbol: runtime?.symbol ?? null,
        strategyType: runtime?.strategyType ?? null,
        updatedAt: runtime?.updatedAt ?? null,
      };
    });

    const totals = strategies.reduce(
      (acc, item) => {
        acc.orders += item.orders;
        acc.fills += item.fills;
        acc.cancelled += item.cancelled;
        acc.rejected += item.rejected;
        acc.realizedPnl += item.realizedPnl;
        return acc;
      },
      {
        orders: 0,
        fills: 0,
        cancelled: 0,
        rejected: 0,
        realizedPnl: 0,
      },
    );

    return {
      generatedAt: new Date().toISOString(),
      strategyId: strategyId ?? null,
      totals: {
        ...totals,
        strategies: strategies.length,
      },
      strategies,
      recentEvents: this.getExecutionLog(strategyId).slice(0, 100),
    };
  }
}
