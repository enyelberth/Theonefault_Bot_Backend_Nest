import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderSide, type BotRunnerRun, type RiskProfile } from '@prisma/client';
import { StrategyRegistry } from '../strategies/v2/registry/strategy-registry';
import { InMemoryStrategyContext } from '../strategies/v2/in-memory-context';
import type { Candle, MarketType, Signal, Timeframe } from '../exchanges/domain';
import type { IExchange } from '../exchanges/exchange.interface';
import { ExchangeSelection, ExchangeSelector } from './exchange-selector.service';
import { timeframeToMs } from '../backtesting/candle-loader';
import { RiskManagerService } from '../risk/risk-manager.service';
import { buildRiskContext } from '../risk/risk-context-builder';
import { BotRunnerRepository } from './bot-runner.repository';
import { CopySignalBus } from '../copy-trading/copy-signal.bus';

export interface StartBotInput {
  runId: string;
  strategyId: string;
  symbol: string;
  timeframe: Timeframe;
  config: Record<string, unknown>;
  exchange: ExchangeSelection;
  pollMs?: number;
  warmupBars?: number;
  riskProfileId?: number;
  ownerId?: number;
  snapshotEveryTicks?: number;
}

export interface BotRunnerStatus {
  runId: string;
  strategyId: string;
  symbol: string;
  timeframe: Timeframe;
  running: boolean;
  startedAt: number;
  lastTickAt: number | null;
  lastSignal: Signal | null;
  ticks: number;
  signalsEmitted: number;
  ordersPlaced: number;
  ordersRejected: number;
  lastRejectReason: string | null;
  errors: number;
  lastError: string | null;
  dbId?: number;
  equity?: number;
  peakEquity?: number;
  drawdownPct?: number;
  openPositions?: number;
  dailyPnl?: number;
  realizedPnl?: number;
}

interface RunnerHandle {
  input: StartBotInput;
  status: BotRunnerStatus;
  exchange: IExchange;
  ctx: InMemoryStrategyContext<any>;
  strategy: ReturnType<StrategyRegistry['create']>;
  timer: NodeJS.Timeout | null;
  lastCandleTime: number;
  stopping: boolean;
  riskProfile: RiskProfile | null;
  initialEquity: number;
  dailyPnl: number;
  realizedPnl: number;
  peakEquity: number;
  currentEquity: number;
  openPositionsCount: number;
  dbRun: BotRunnerRun;
  snapshotEveryTicks: number;
}

@Injectable()
export class BotRunnerService {
  private readonly logger = new Logger(BotRunnerService.name);
  private readonly runners = new Map<string, RunnerHandle>();

  constructor(
    private readonly registry: StrategyRegistry,
    private readonly selector: ExchangeSelector,
    private readonly risk: RiskManagerService,
    private readonly repo: BotRunnerRepository,
    private readonly copyBus: CopySignalBus,
  ) {}

  async start(input: StartBotInput): Promise<BotRunnerStatus> {
    if (this.runners.has(input.runId)) {
      throw new Error(`Runner "${input.runId}" already active`);
    }
    if (!this.registry.has(input.strategyId)) {
      throw new NotFoundException(`Strategy "${input.strategyId}" not registered`);
    }

    const exchange = this.selector.resolve(input.exchange);
    const strategy = this.registry.create(input.strategyId);
    const ctx = new InMemoryStrategyContext({
      strategyId: input.runId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      config: input.config,
      exchange,
      historyLimit: 1000,
    });

    if (strategy.init) await strategy.init(ctx);

    if (input.warmupBars && input.warmupBars > 0) {
      const seed = await exchange.getCandles({
        symbol: input.symbol,
        timeframe: input.timeframe,
        limit: input.warmupBars,
      });
      ctx.seedHistory(seed);
    }

    const riskProfile = input.riskProfileId
      ? await this.risk.loadProfile(input.riskProfileId)
      : null;
    const initialEquity = await this.readEquity(exchange).catch(() => 0);
    const initialOpen = await this.countPositions(exchange).catch(() => 0);

    const dbRun = await this.repo.createRun({
      runId: input.runId,
      strategyId: input.strategyId,
      ownerId: input.ownerId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      exchangeMode: input.exchange.mode,
      exchangeId: input.exchange.exchangeId,
      paperAccountId: input.exchange.paperAccountId,
      riskProfileId: input.riskProfileId,
      config: input.config,
      initialEquity,
    });

    const status: BotRunnerStatus = {
      runId: input.runId,
      strategyId: input.strategyId,
      symbol: input.symbol,
      timeframe: input.timeframe,
      running: true,
      startedAt: Date.now(),
      lastTickAt: null,
      lastSignal: null,
      ticks: 0,
      signalsEmitted: 0,
      ordersPlaced: 0,
      ordersRejected: 0,
      lastRejectReason: null,
      errors: 0,
      lastError: null,
      dbId: dbRun.id,
      equity: initialEquity,
      peakEquity: initialEquity,
      drawdownPct: 0,
      openPositions: initialOpen,
      dailyPnl: 0,
      realizedPnl: 0,
    };

    const handle: RunnerHandle = {
      input,
      status,
      exchange,
      ctx,
      strategy,
      timer: null,
      lastCandleTime: 0,
      stopping: false,
      riskProfile,
      initialEquity,
      dailyPnl: 0,
      realizedPnl: 0,
      peakEquity: initialEquity,
      currentEquity: initialEquity,
      openPositionsCount: initialOpen,
      dbRun,
      snapshotEveryTicks: input.snapshotEveryTicks ?? 5,
    };

    const pollMs = input.pollMs ?? Math.min(timeframeToMs(input.timeframe), 60_000);
    handle.timer = setInterval(() => this.tick(handle).catch((e) => this.onErr(handle, e)), pollMs);

    this.runners.set(input.runId, handle);
    this.logger.log(
      `started runner ${input.runId} ${input.strategyId} ${input.symbol} ${input.timeframe} dbId=${dbRun.id}`,
    );
    return status;
  }

  async stop(runId: string): Promise<BotRunnerStatus> {
    const handle = this.runners.get(runId);
    if (!handle) throw new NotFoundException(`Runner "${runId}" not found`);
    handle.stopping = true;
    if (handle.timer) clearInterval(handle.timer);
    handle.status.running = false;
    if (handle.strategy.shutdown) {
      try {
        await handle.strategy.shutdown(handle.ctx);
      } catch (e: any) {
        this.logger.warn(`shutdown ${runId}: ${e.message}`);
      }
    }
    const finalEquity = await this.readEquity(handle.exchange).catch(() => handle.currentEquity);
    await this.repo.stopRun(runId, finalEquity, handle.status.lastError ?? undefined).catch((e) =>
      this.logger.warn(`stopRun persist failed: ${e.message}`),
    );
    this.runners.delete(runId);
    this.logger.log(`stopped runner ${runId}`);
    return handle.status;
  }

  status(runId: string): BotRunnerStatus {
    const handle = this.runners.get(runId);
    if (!handle) throw new NotFoundException(`Runner "${runId}" not found`);
    return handle.status;
  }

  list(): BotRunnerStatus[] {
    return Array.from(this.runners.values()).map((h) => h.status);
  }

  async history(filters: { ownerId?: number; limit?: number } = {}) {
    return this.repo.listRuns(filters);
  }

  async trades(runId: string, limit?: number) {
    const run = await this.repo.byRunId(runId);
    return this.repo.listTrades(run.id, limit);
  }

  async snapshots(runId: string, limit?: number) {
    const run = await this.repo.byRunId(runId);
    return this.repo.listSnapshots(run.id, limit);
  }

  private async tick(handle: RunnerHandle): Promise<void> {
    if (handle.stopping) return;
    handle.status.ticks += 1;
    handle.status.lastTickAt = Date.now();

    const candles = await handle.exchange.getCandles({
      symbol: handle.input.symbol,
      timeframe: handle.input.timeframe,
      limit: 2,
    });
    if (candles.length === 0) return;
    const latestClosed = candles.filter((c) => c.closed).pop();
    if (!latestClosed) return;
    if (latestClosed.openTime <= handle.lastCandleTime) return;
    handle.lastCandleTime = latestClosed.openTime;
    handle.ctx.pushCandle(latestClosed);
    handle.ctx.setTicker({
      symbol: handle.input.symbol,
      price: latestClosed.close,
      timestamp: latestClosed.closeTime,
    });

    const signal = await handle.strategy.onCandle(latestClosed, handle.ctx);
    if (signal) {
      handle.status.lastSignal = signal;
      handle.status.signalsEmitted += 1;
      if (signal.action !== 'HOLD') {
        const gated = await this.gateSignal(handle, signal);
        if (gated) {
          await this.executeSignal(handle, gated);
          this.copyBus.publish({
            masterRunId: handle.input.runId,
            masterEquity: handle.currentEquity,
            signal: gated,
            emittedAt: Date.now(),
          });
        }
      }
    }

    if (handle.status.ticks % handle.snapshotEveryTicks === 0) {
      await this.snapshot(handle).catch((e) =>
        this.logger.warn(`snapshot: ${e.message}`),
      );
    }
    await this.repo
      .touchStats(handle.input.runId, {
        ticks: 1,
        signals: signal ? 1 : 0,
      })
      .catch(() => undefined);
  }

  private async gateSignal(handle: RunnerHandle, signal: Signal): Promise<Signal | null> {
    const equity = await this.readEquity(handle.exchange).catch(() => handle.currentEquity);
    handle.currentEquity = equity;
    handle.peakEquity = Math.max(handle.peakEquity, equity);
    const currentDrawdownPct =
      handle.peakEquity > 0 ? ((handle.peakEquity - equity) / handle.peakEquity) * 100 : 0;
    handle.openPositionsCount = await this.countPositions(handle.exchange).catch(
      () => handle.openPositionsCount,
    );
    handle.dailyPnl = await this.repo.computeDailyPnl(handle.dbRun.id).catch(() => handle.dailyPnl);

    const killed = await this.risk.isKilled('BOT', handle.input.runId);
    const context = buildRiskContext({
      accountEquity: equity,
      freeMargin: equity,
      dailyPnl: handle.dailyPnl,
      currentDrawdownPct,
      openPositionsCount: handle.openPositionsCount,
      maxDrawdownPct: handle.riskProfile?.maxDrawdownPct ?? 100,
      maxDailyLossPct: handle.riskProfile?.maxDailyLossPct ?? 100,
      maxPositionSizePct: handle.riskProfile?.maxPositionSizePct ?? 100,
      maxOpenPositions: handle.riskProfile?.maxOpenPositions ?? 100,
      killSwitchEnabled: killed,
    });
    const result = await this.risk.check({
      signal,
      context,
      history: handle.ctx.history(),
      profile: handle.riskProfile,
    });

    handle.status.equity = equity;
    handle.status.peakEquity = handle.peakEquity;
    handle.status.drawdownPct = currentDrawdownPct;
    handle.status.openPositions = handle.openPositionsCount;
    handle.status.dailyPnl = handle.dailyPnl;

    if (!result.decision.allowed) {
      handle.status.ordersRejected += 1;
      handle.status.lastRejectReason = `${result.decision.code}: ${result.decision.reason}`;
      await this.repo
        .touchStats(handle.input.runId, { ordersRejected: 1, peakEquity: handle.peakEquity })
        .catch(() => undefined);
      this.logger.warn(`[${handle.input.runId}] rejected: ${handle.status.lastRejectReason}`);
      return null;
    }
    return result.adjustedSignal ?? signal;
  }

  private async readEquity(exchange: IExchange): Promise<number> {
    const balance = await exchange.getBalance('SPOT').catch(() => null);
    if (!balance) return 0;
    return balance.balances.reduce((a, b) => a + b.total, 0);
  }

  private async countPositions(exchange: IExchange): Promise<number> {
    const positions = await exchange
      .getPositions('SPOT' as MarketType)
      .catch(() => [] as Awaited<ReturnType<IExchange['getPositions']>>);
    return positions.filter((p) => p.quantity > 0 && p.side !== 'FLAT').length;
  }

  private async executeSignal(handle: RunnerHandle, signal: Signal): Promise<void> {
    if (!signal.side || !signal.type) return;
    if (signal.action === 'CANCEL_ALL') {
      await handle.exchange.cancelAllOrders(signal.symbol).catch((e) =>
        this.logger.warn(`cancelAll: ${e.message}`),
      );
      return;
    }
    try {
      const order = await handle.exchange.placeOrder({
        symbol: signal.symbol,
        side: signal.side,
        type: signal.type,
        quantity: signal.quantity,
        quoteQuantity: signal.quoteQuantity,
        price: signal.price,
        stopPrice: signal.stopPrice,
        timeInForce: signal.timeInForce,
        market: signal.market ?? 'SPOT',
      });
      handle.status.ordersPlaced += 1;
      await this.repo.touchStats(handle.input.runId, { ordersPlaced: 1 }).catch(() => undefined);
      this.logger.log(
        `[${handle.input.runId}] ${signal.action} ${signal.side} ${signal.symbol} order=${order.id} status=${order.status}`,
      );

      if (order.status === 'FILLED') {
        await this.recordTrade(handle, signal, order.id, order.averagePrice || order.price, order.filledQuantity);
        if (handle.strategy.onOrderFilled) {
          await handle.strategy.onOrderFilled(handle.ctx);
        }
      }
    } catch (e: any) {
      this.onErr(handle, e);
    }
  }

  private async recordTrade(
    handle: RunnerHandle,
    signal: Signal,
    orderId: string,
    fillPrice: number,
    quantity: number,
  ): Promise<void> {
    if (!signal.side || quantity <= 0) return;
    const isOpen = signal.action === 'OPEN' || signal.action === 'ADJUST';
    const isClose = signal.action === 'CLOSE';

    if (isOpen) {
      await this.repo
        .openTrade({
          botRunnerRunId: handle.dbRun.id,
          orderId,
          symbol: signal.symbol,
          side: signal.side as OrderSide,
          entryPrice: fillPrice,
          quantity,
          fee: 0,
          reason: signal.reason,
        })
        .catch((e) => this.logger.warn(`openTrade persist: ${e.message}`));
      return;
    }

    if (isClose) {
      const opposite: OrderSide = signal.side === 'BUY' ? OrderSide.SELL : OrderSide.BUY;
      const openTrade = await this.repo.findOpenTrade(handle.dbRun.id, signal.symbol, opposite);
      if (!openTrade) {
        this.logger.warn(`[${handle.input.runId}] CLOSE without matching open trade ${signal.symbol}`);
        return;
      }
      const closed = await this.repo
        .closeTrade({
          tradeId: openTrade.id,
          orderId,
          exitPrice: fillPrice,
          additionalFee: 0,
          reason: signal.reason,
        })
        .catch((e) => {
          this.logger.warn(`closeTrade persist: ${e.message}`);
          return null;
        });
      if (closed?.pnl) {
        const pnl = Number(closed.pnl);
        handle.realizedPnl += pnl;
        handle.status.realizedPnl = handle.realizedPnl;
        await this.repo
          .touchStats(handle.input.runId, {
            realizedPnl: handle.realizedPnl,
            dailyPnl: await this.repo.computeDailyPnl(handle.dbRun.id).catch(() => handle.dailyPnl),
          })
          .catch(() => undefined);
      }
    }
  }

  private async snapshot(handle: RunnerHandle): Promise<void> {
    const equity = handle.currentEquity;
    const drawdown =
      handle.peakEquity > 0 ? ((handle.peakEquity - equity) / handle.peakEquity) * 100 : 0;
    await this.repo.snapshot({
      botRunnerRunId: handle.dbRun.id,
      equity,
      drawdownPct: drawdown,
      openPositions: handle.openPositionsCount,
      extras: {
        realizedPnl: handle.realizedPnl,
        dailyPnl: handle.dailyPnl,
        ticks: handle.status.ticks,
        signals: handle.status.signalsEmitted,
      },
    });
  }

  private onErr(handle: RunnerHandle, err: Error): void {
    handle.status.errors += 1;
    handle.status.lastError = err.message;
    this.logger.error(`[${handle.input.runId}] ${err.message}`);
    this.repo
      .touchStats(handle.input.runId, { errors: 1, lastError: err.message })
      .catch(() => undefined);
  }
}
