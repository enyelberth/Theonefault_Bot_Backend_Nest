import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderSide, type BotRunnerRun, type RiskProfile } from '@prisma/client';
import { StrategyRegistry } from '../strategies/v2/registry/strategy-registry';
import { InMemoryStrategyContext } from '../strategies/v2/in-memory-context';
import type {
  Candle,
  MarketType,
  Order,
  Signal,
  Ticker,
  Timeframe,
} from '../exchanges/domain';
import type { IExchange } from '../exchanges/exchange.interface';
import {
  ExchangeSelection,
  ExchangeSelector,
} from './exchange-selector.service';
import { timeframeToMs } from '../backtesting/candle-loader';
import { RiskManagerService } from '../risk/risk-manager.service';
import { OperationalAlertsService } from '../operational-alerts/operational-alerts.service';
import { CapitalLedgerService } from '../capital-ledger/capital-ledger.service';
import { buildRiskContext } from '../risk/risk-context-builder';
import { BotRunnerRepository } from './bot-runner.repository';
import { CopySignalBus } from '../copy-trading/copy-signal.bus';
import {
  initTrailingStop,
  updateTrailingStop,
  type TrailingStopConfig,
  type TrailingStopState,
} from '../risk/stops/trailing-stop';
import {
  initTpLadder,
  evaluateTpLadder,
  isTpLadderComplete,
  type TpLadderConfig,
  type TpLadderState,
} from '../risk/stops/tp-ladder';
import { randomUUID } from 'crypto';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import type { RegimeFilterConfig } from '../market-regime/market-regime.types';
import type { MultiTimeframeConfig } from '../market-regime/multi-timeframe';
import { KlineCollectorService } from '../market-data/kline-collector.service';
import { PriceForecastService } from '../market-prediction/price-forecast.service';
import {
  computeConfidenceMultiplier,
  type ConfidenceMultiplierConfig,
} from '../market-prediction/price-forecast.calculator';
import { ConfluenceService } from '../confluence/confluence.service';

const WS_TRACKED_TIMEFRAMES = new Set<Timeframe>(['1m', '5m', '15m', '1h']);
// Default si la estrategia no trae config.maxOrderAgeMs. Mismo orden de
// magnitud que usaban las estrategias legacy con órdenes resting.
const DEFAULT_MAX_ORDER_AGE_MS = 5 * 60_000;

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
  trailingStates: Map<
    number,
    {
      state: TrailingStopState;
      quantity: number;
      symbol: string;
      side: OrderSide;
    }
  >;
  trailingConfig: TrailingStopConfig | null;
  tpLadderStates: Map<
    number,
    { state: TpLadderState; symbol: string; side: OrderSide }
  >;
  tpLadderConfig: TpLadderConfig | null;
  wsUnsubscribe: (() => void) | null;
  wsDriven: boolean;
  ticking: boolean;
  // Órdenes LIMIT/LIMIT_MAKER que el exchange aceptó pero todavía no llenó
  // (status NEW/PARTIALLY_FILLED). Antes esto no se rastreaba en ningún
  // lado: la orden quedaba resting en el exchange para siempre sin que el
  // runner volviera a mirarla — sin fill nunca se abría el trade, y sin
  // cancelación por edad podía quedar viva indefinidamente.
  pendingOrders: Map<string, PendingOrder>;
}

interface PendingOrder {
  symbol: string;
  market: MarketType;
  signal: Signal;
  correlationId: string;
  placedAt: number;
  maxAgeMs: number;
}

@Injectable()
export class BotRunnerService {
  private readonly logger = new Logger(BotRunnerService.name);
  private readonly runners = new Map<string, RunnerHandle>();
  // Reserva de runId mientras start() hace su trabajo async (exchange,
  // DB, WS) y todavía no llegó a this.runners.set(). Sin esto, dos start()
  // concurrentes con el mismo runId pasan ambos el check de "ya activa" y
  // gastan llamadas de exchange/WS duplicadas antes de que el @unique de
  // Prisma frene la segunda — y el caller recibe un error crudo de Prisma
  // en vez de un rechazo limpio.
  private readonly startingRunIds = new Set<string>();

  constructor(
    private readonly registry: StrategyRegistry,
    private readonly selector: ExchangeSelector,
    private readonly risk: RiskManagerService,
    private readonly repo: BotRunnerRepository,
    private readonly copyBus: CopySignalBus,
    private readonly regimes: MarketRegimeService,
    private readonly klines: KlineCollectorService,
    private readonly alerts: OperationalAlertsService,
    private readonly ledger: CapitalLedgerService,
    private readonly forecasts: PriceForecastService,
    private readonly confluence: ConfluenceService,
  ) {}

  private async emitCloseCapitalEvents(
    handle: RunnerHandle,
    closed: {
      id: number;
      pnl: unknown;
      fee: unknown;
      symbol: string;
      side: string;
    },
    correlationId: string,
  ): Promise<void> {
    const netPnl = Number(closed.pnl ?? 0);
    const totalFee = Number(closed.fee ?? 0);
    const grossPnl = netPnl + totalFee;
    const source = handle.exchange?.id;
    const currency = this.quoteCurrencyFromSymbol(closed.symbol);
    try {
      await this.ledger.recordMany([
        {
          type: 'TRADE_PNL',
          amount: grossPnl,
          currency,
          botRunnerRunId: handle.dbRun.id,
          tradeId: closed.id,
          correlationId,
          source,
          payload: {
            symbol: closed.symbol,
            side: closed.side,
            netPnl,
            totalFee,
          },
        },
        {
          type: 'FEE',
          amount: -Math.abs(totalFee),
          currency,
          botRunnerRunId: handle.dbRun.id,
          tradeId: closed.id,
          correlationId,
          source,
          payload: { symbol: closed.symbol, side: closed.side },
        },
      ]);
    } catch (e: any) {
      this.logger.warn(`ledger emit failed: ${e?.message ?? e}`);
    }
  }

  private quoteCurrencyFromSymbol(symbol: string): string {
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
      if (symbol.endsWith(q)) return q;
    }
    return 'USDT';
  }

  async start(input: StartBotInput): Promise<BotRunnerStatus> {
    if (this.runners.has(input.runId) || this.startingRunIds.has(input.runId)) {
      throw new ConflictException(`Runner "${input.runId}" already active`);
    }
    if (!this.registry.has(input.strategyId)) {
      throw new NotFoundException(
        `Strategy "${input.strategyId}" not registered`,
      );
    }
    this.startingRunIds.add(input.runId);
    try {
      return await this.startInternal(input);
    } finally {
      this.startingRunIds.delete(input.runId);
    }
  }

  private async startInternal(input: StartBotInput): Promise<BotRunnerStatus> {
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

    const warmupBars = input.warmupBars ?? 100;
    let initialLastCandleTime = 0;
    if (warmupBars > 0) {
      const seed = await exchange.getCandles({
        symbol: input.symbol,
        timeframe: input.timeframe,
        limit: warmupBars,
      });
      ctx.seedHistory(seed);
      initialLastCandleTime = seed.at(-1)?.openTime ?? 0;
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
      lastCandleTime: initialLastCandleTime,
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
      trailingStates: new Map(),
      trailingConfig:
        (riskProfile?.trailingStop as unknown as TrailingStopConfig | null) ??
        null,
      tpLadderStates: new Map(),
      tpLadderConfig:
        (riskProfile?.tpLadder as unknown as TpLadderConfig | null) ?? null,
      wsUnsubscribe: null,
      wsDriven: false,
      ticking: false,
      pendingOrders: new Map(),
    };

    const canUseWs =
      input.exchange.mode === 'real' &&
      WS_TRACKED_TIMEFRAMES.has(input.timeframe);

    if (canUseWs) {
      try {
        await this.klines.requestSubscription(input.symbol);
        handle.wsUnsubscribe = this.klines.onClosedCandle(
          input.symbol,
          input.timeframe,
          () => {
            if (handle.stopping || handle.ticking) return;
            handle.ticking = true;
            this.tick(handle)
              .catch((e) => this.onErr(handle, e))
              .finally(() => {
                handle.ticking = false;
              });
          },
        );
        handle.wsDriven = true;
        this.logger.log(
          `runner ${input.runId} WS-driven kline ${input.symbol}@${input.timeframe}`,
        );
      } catch (err) {
        this.logger.warn(
          `runner ${input.runId} WS subscription failed, falling back to polling: ${(err as Error).message}`,
        );
        handle.wsDriven = false;
      }
    }

    const pollMs = handle.wsDriven
      ? Math.max(timeframeToMs(input.timeframe) * 2, 300_000)
      : (input.pollMs ?? Math.min(timeframeToMs(input.timeframe), 60_000));
    handle.timer = setInterval(() => {
      // Guard against overlapping with an in-flight WS-triggered tick (or a
      // previous interval tick that is still running): without this check,
      // the fallback poll can execute the same candle's signal a second time
      // while the WS-driven tick() is still awaiting an exchange call,
      // placing a duplicate real order.
      if (handle.stopping || handle.ticking) return;
      handle.ticking = true;
      this.tick(handle)
        .catch((e) => this.onErr(handle, e))
        .finally(() => {
          handle.ticking = false;
        });
    }, pollMs);

    this.runners.set(input.runId, handle);
    this.logger.log(
      `started runner ${input.runId} ${input.strategyId} ${input.symbol} ${input.timeframe} dbId=${dbRun.id} ws=${handle.wsDriven}`,
    );
    return status;
  }

  async stop(runId: string): Promise<BotRunnerStatus> {
    const handle = this.runners.get(runId);
    if (!handle) throw new NotFoundException(`Runner "${runId}" not found`);
    handle.stopping = true;
    if (handle.wsUnsubscribe) {
      try {
        handle.wsUnsubscribe();
      } catch (e: any) {
        this.logger.warn(`ws unsubscribe ${runId}: ${e.message}`);
      }
      handle.wsUnsubscribe = null;
    }
    if (handle.timer) clearInterval(handle.timer);
    handle.status.running = false;
    if (handle.pendingOrders.size > 0) {
      // Sin esto, una orden LIMIT resting quedaba viva en el exchange
      // después de "parar" el bot — nadie la volvía a mirar nunca más.
      for (const [orderId, pending] of [...handle.pendingOrders.entries()]) {
        await this.cancelPendingOrder(
          handle,
          orderId,
          pending,
          'runner stopped',
        );
      }
    }
    if (handle.strategy.shutdown) {
      try {
        await handle.strategy.shutdown(handle.ctx);
      } catch (e: any) {
        this.logger.warn(`shutdown ${runId}: ${e.message}`);
      }
    }
    const finalEquity = await this.readEquity(handle.exchange).catch(
      () => handle.currentEquity,
    );
    await this.repo
      .stopRun(runId, finalEquity, handle.status.lastError ?? undefined)
      .catch((e) => this.logger.warn(`stopRun persist failed: ${e.message}`));
    this.runners.delete(runId);
    this.logger.log(`stopped runner ${runId}`);
    return handle.status;
  }

  status(runId: string): BotRunnerStatus {
    const handle = this.runners.get(runId);
    if (!handle) throw new NotFoundException(`Runner "${runId}" not found`);
    return handle.status;
  }

  list(ownerId?: number): BotRunnerStatus[] {
    return Array.from(this.runners.values())
      .filter((h) => ownerId === undefined || h.input.ownerId === ownerId)
      .map((h) => h.status);
  }

  /** Lanza NotFoundException/ForbiddenException si el runId no existe o no pertenece a ownerId. */
  async assertOwnership(runId: string, ownerId: number): Promise<void> {
    const run = await this.repo.byRunId(runId);
    if (run.ownerId !== ownerId) {
      throw new ForbiddenException(
        `El bot ${runId} no pertenece al usuario autenticado.`,
      );
    }
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

  async traces(
    runId: string,
    filters: { correlationId?: string; eventType?: string; limit?: number },
  ) {
    const run = await this.repo.byRunId(runId);
    return this.repo.listTraces(run.id, filters);
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

    await this.updateOpenTradeExtremes(handle, latestClosed.close).catch((e) =>
      this.logger.warn(`updateExtremes: ${e.message}`),
    );

    if (handle.pendingOrders.size > 0) {
      await this.reconcilePendingOrders(handle).catch((e) =>
        this.logger.warn(`reconcilePendingOrders: ${e.message}`),
      );
    }

    if (handle.trailingConfig && handle.trailingStates.size > 0) {
      await this.checkTrailingStops(handle, latestClosed).catch((e) =>
        this.logger.warn(`trailingStop: ${e.message}`),
      );
    }

    if (handle.tpLadderConfig && handle.tpLadderStates.size > 0) {
      await this.checkTpLadders(handle, latestClosed).catch((e) =>
        this.logger.warn(`tpLadder: ${e.message}`),
      );
    }

    const regime = await this.regimes
      .detectAndStore(
        handle.input.symbol,
        handle.input.timeframe,
        handle.ctx.history(),
      )
      .catch((error: Error) => {
        this.logger.warn(`market regime persist: ${error.message}`);
        return this.regimes.detect(
          handle.input.symbol,
          handle.input.timeframe,
          handle.ctx.history(),
        );
      });
    handle.ctx.setState('marketRegime', regime);
    const emittedSignal = await handle.strategy.onCandle(
      latestClosed,
      handle.ctx,
    );
    const signal: Signal | null = emittedSignal
      ? {
          ...emittedSignal,
          metadata: {
            ...(emittedSignal.metadata ?? {}),
            marketRegime: regime,
          },
        }
      : null;
    if (signal) {
      const correlationId = randomUUID();
      handle.status.lastSignal = signal;
      handle.status.signalsEmitted += 1;
      await this.trace(handle, correlationId, 'SIGNAL_EMITTED', {
        signal: this.signalPayload(signal),
        marketRegime: regime,
        candle: {
          openTime: latestClosed.openTime,
          closeTime: latestClosed.closeTime,
          open: latestClosed.open,
          high: latestClosed.high,
          low: latestClosed.low,
          close: latestClosed.close,
          volume: latestClosed.volume,
        },
      });
      if (signal.action !== 'HOLD') {
        const isEntry = signal.action === 'OPEN' || signal.action === 'ADJUST';
        const regimeAllowed =
          !isEntry ||
          this.regimes.allows(regime, this.regimeFilter(handle.input.config));
        await this.trace(
          handle,
          correlationId,
          regimeAllowed ? 'REGIME_ALLOWED' : 'REGIME_REJECTED',
          {
            marketRegime: regime,
            filter: this.regimeFilter(handle.input.config),
          },
        );
        if (!regimeAllowed) {
          handle.status.ordersRejected += 1;
          handle.status.lastRejectReason = `REGIME_FILTER: ${regime.regime} confidence=${regime.confidence}`;
          await this.repo
            .touchStats(handle.input.runId, { ordersRejected: 1 })
            .catch(() => undefined);
        } else {
          let candidate = signal;
          const timeframeConfig = this.multiTimeframeConfig(
            handle.input.config,
          );
          let timeframeAllowed = true;
          if (isEntry && signal.side && timeframeConfig?.enabled) {
            const evaluation = await this.regimes.evaluateTimeframes({
              botRunnerRunId: handle.dbRun.id,
              correlationId,
              symbol: signal.symbol,
              primaryTimeframe: handle.input.timeframe,
              side: signal.side,
              primary: regime,
              config: timeframeConfig,
              exchange: handle.exchange,
            });
            timeframeAllowed = evaluation.aligned;
            candidate = {
              ...signal,
              metadata: {
                ...(signal.metadata ?? {}),
                multiTimeframe: evaluation,
              },
            };
            await this.trace(
              handle,
              correlationId,
              timeframeAllowed ? 'TIMEFRAME_ALLOWED' : 'TIMEFRAME_REJECTED',
              evaluation as unknown as Record<string, unknown>,
            );
          }
          if (!timeframeAllowed) {
            handle.status.ordersRejected += 1;
            handle.status.lastRejectReason =
              'MULTI_TIMEFRAME_FILTER: contexts not aligned';
            await this.repo
              .touchStats(handle.input.runId, { ordersRejected: 1 })
              .catch(() => undefined);
          } else {
            const forecastCheck = await this.checkPriceForecast(
              handle,
              candidate,
              isEntry,
              correlationId,
            );
            if (!forecastCheck.allowed) {
              handle.status.ordersRejected += 1;
              handle.status.lastRejectReason =
                'PRICE_FORECAST_FILTER: divergencia estadística contra la señal';
              await this.repo
                .touchStats(handle.input.runId, { ordersRejected: 1 })
                .catch(() => undefined);
            } else {
              const confluenceAllowed = await this.checkConfluence(
                handle,
                forecastCheck.signal,
                isEntry,
                correlationId,
              );
              if (!confluenceAllowed) {
                handle.status.ordersRejected += 1;
                handle.status.lastRejectReason =
                  'CONFLUENCE_FILTER: score insuficiente o en contra de la señal';
                await this.repo
                  .touchStats(handle.input.runId, { ordersRejected: 1 })
                  .catch(() => undefined);
              } else {
                const gated = await this.gateSignal(
                  handle,
                  forecastCheck.signal,
                  correlationId,
                );
                if (gated) {
                  await this.executeSignal(handle, gated, correlationId);
                  this.copyBus.publish({
                    masterRunId: handle.input.runId,
                    masterEquity: handle.currentEquity,
                    signal: gated,
                    emittedAt: Date.now(),
                  });
                }
              }
            }
          }
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

  /**
   * Filtro opcional (config.priceForecast) basado en el forecast AR+GARCH de
   * src/market-prediction. Es una señal probabilística más, no una
   * garantía: solo bloquea OPEN/ADJUST, nunca cierres, y nunca reemplaza al
   * motor de riesgo (gateSignal sigue corriendo después si esto permite
   * pasar). Cualquier error o dato insuficiente falla hacia "permitido" por
   * defecto salvo que allowInsufficientData se desactive explícitamente --
   * un filtro auxiliar no debería convertirse en una nueva fuente de
   * caídas del bot.
   */
  private async checkPriceForecast(
    handle: RunnerHandle,
    signal: Signal,
    isEntry: boolean,
    correlationId: string,
  ): Promise<{ allowed: boolean; signal: Signal }> {
    if (!isEntry || !signal.side) return { allowed: true, signal };
    const filter = this.priceForecastFilter(handle.input.config);
    if (!filter?.enabled) return { allowed: true, signal };

    let result: Awaited<ReturnType<PriceForecastService['current']>> | null = null;
    try {
      result = await this.forecasts.current({
        symbol: signal.symbol,
        timeframe: handle.input.timeframe,
        horizonBars: filter.horizonBars,
      });
    } catch (e: any) {
      this.logger.warn(`priceForecast check failed: ${e.message}`);
      await this.trace(handle, correlationId, 'PRICE_FORECAST_ALLOWED', {
        reason: 'forecast error, fail-open',
        error: e.message,
      });
      return { allowed: true, signal };
    }

    if (!result || result.forecast?.status !== 'OK') {
      await this.trace(
        handle,
        correlationId,
        filter.allowInsufficientData
          ? 'PRICE_FORECAST_ALLOWED'
          : 'PRICE_FORECAST_REJECTED',
        { reason: 'insufficient data', filter },
      );
      return { allowed: filter.allowInsufficientData, signal };
    }

    const forecast = result.forecast;
    const referencePrice = signal.price ?? forecast.lastPrice;
    const expectedChangePct =
      referencePrice > 0
        ? ((forecast.forecastPrice - referencePrice) / referencePrice) * 100
        : 0;
    const allowed =
      signal.side === 'BUY'
        ? expectedChangePct >= -filter.maxDivergencePct
        : expectedChangePct <= filter.maxDivergencePct;

    let adjustedSignal = signal;
    let sizeMultiplier: number | undefined;
    if (allowed && filter.sizeConfidence) {
      const accuracy = await this.forecasts
        .accuracySummary(signal.symbol, handle.input.timeframe, filter.horizonBars)
        .catch((e: any) => {
          this.logger.warn(`accuracySummary failed: ${e.message}`);
          return null;
        });
      if (accuracy) {
        sizeMultiplier = computeConfidenceMultiplier(
          accuracy.directionalAccuracyPct,
          accuracy.sampleSize,
          filter.sizeConfidence,
        );
        adjustedSignal = {
          ...signal,
          metadata: {
            ...(signal.metadata ?? {}),
            forecastSizeMultiplier: sizeMultiplier,
            forecastAccuracy: accuracy,
          },
        };
      }
    }

    await this.trace(
      handle,
      correlationId,
      allowed ? 'PRICE_FORECAST_ALLOWED' : 'PRICE_FORECAST_REJECTED',
      { forecast, expectedChangePct, filter, sizeMultiplier },
    );
    return { allowed, signal: adjustedSignal };
  }

  /**
   * Filtro opcional (config.confluenceFilter) que unifica régimen + MTF +
   * momentum (+ forecast AR+GARCH si usePriceForecast) en un solo score
   * 0-100 vía ConfluenceService. No reemplaza regimeFilter/multiTimeframe/
   * priceForecast -- son gates independientes, pueden convivir; este es un
   * criterio adicional, apagado por defecto. Recalcula régimen/MTF por su
   * cuenta (no reusa `regime`/`timeframeConfig` ya calculados antes en este
   * mismo tick) -- costo extra de cómputo aceptado a cambio de no acoplar
   * ConfluenceService a los objetos internos del bot-runner.
   */
  private async checkConfluence(
    handle: RunnerHandle,
    signal: Signal,
    isEntry: boolean,
    correlationId: string,
  ): Promise<boolean> {
    if (!isEntry || !signal.side) return true;
    const filter = this.confluenceFilterConfig(handle.input.config);
    if (!filter?.enabled) return true;

    let result: Awaited<ReturnType<ConfluenceService['compute']>> | null = null;
    try {
      result = await this.confluence.compute(signal.symbol, handle.input.timeframe, {
        usePriceForecast: filter.usePriceForecast,
        priceForecastHorizonBars: filter.priceForecastHorizonBars,
      });
    } catch (e: any) {
      this.logger.warn(`confluence check failed: ${e.message}`);
      await this.trace(handle, correlationId, 'CONFLUENCE_ALLOWED', {
        reason: 'confluence error, fail-open',
        error: e.message,
      });
      return true;
    }

    const biasOk = result.bias !== 'NEUTRAL' || filter.allowNeutral;
    const confidenceOk = result.confidence >= filter.minConfidence;
    const allowed =
      biasOk &&
      confidenceOk &&
      (signal.side === 'BUY'
        ? result.score >= filter.minScore
        : result.score <= 100 - filter.minScore);

    await this.trace(
      handle,
      correlationId,
      allowed ? 'CONFLUENCE_ALLOWED' : 'CONFLUENCE_REJECTED',
      { confluence: result, filter },
    );
    return allowed;
  }

  private confluenceFilterConfig(config: Record<string, unknown>):
    | {
        enabled: boolean;
        minScore: number;
        minConfidence: number;
        allowNeutral: boolean;
        usePriceForecast: boolean;
        priceForecastHorizonBars: number;
      }
    | undefined {
    const raw = config.confluenceFilter;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    return {
      enabled: value.enabled === true,
      minScore:
        typeof value.minScore === 'number'
          ? Math.max(50, Math.min(100, value.minScore))
          : 55,
      minConfidence:
        typeof value.minConfidence === 'number'
          ? Math.max(0, Math.min(100, value.minConfidence))
          : 0,
      allowNeutral: value.allowNeutral === true,
      usePriceForecast: value.usePriceForecast === true,
      priceForecastHorizonBars:
        typeof value.priceForecastHorizonBars === 'number' &&
        Number.isInteger(value.priceForecastHorizonBars) &&
        value.priceForecastHorizonBars > 0
          ? value.priceForecastHorizonBars
          : 5,
    };
  }

  private async gateSignal(
    handle: RunnerHandle,
    signal: Signal,
    correlationId: string,
  ): Promise<Signal | null> {
    const equity = await this.readEquity(handle.exchange).catch(
      () => handle.currentEquity,
    );
    const freeMargin = await this.readFreeMargin(handle.exchange).catch(
      () => equity,
    );
    handle.currentEquity = equity;
    handle.peakEquity = Math.max(handle.peakEquity, equity);
    const currentDrawdownPct =
      handle.peakEquity > 0
        ? ((handle.peakEquity - equity) / handle.peakEquity) * 100
        : 0;
    handle.openPositionsCount = await this.countPositions(
      handle.exchange,
    ).catch(() => handle.openPositionsCount);
    handle.dailyPnl = await this.repo
      .computeDailyPnl(handle.dbRun.id)
      .catch(() => handle.dailyPnl);

    const killed = await this.risk.isKilled('BOT', handle.input.runId);
    const context = buildRiskContext({
      accountEquity: equity,
      freeMargin,
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
        .touchStats(handle.input.runId, {
          ordersRejected: 1,
          peakEquity: handle.peakEquity,
        })
        .catch(() => undefined);
      this.logger.warn(
        `[${handle.input.runId}] rejected: ${handle.status.lastRejectReason}`,
      );
      await this.trace(handle, correlationId, 'RISK_REJECTED', {
        decision: result.decision,
        context,
        sizing: result.sizing,
      });
      const autoTripCodes = new Set(['MAX_DAILY_LOSS', 'MAX_DRAWDOWN']);
      const decisionCode = result.decision.code;
      const decisionReason = result.decision.reason;
      if (decisionCode && autoTripCodes.has(decisionCode)) {
        await this.risk
          .setKillSwitch(
            'BOT',
            handle.input.runId,
            true,
            `capital-guard: ${decisionReason}`,
            'CAPITAL_GUARD',
          )
          .then(() =>
            this.trace(handle, correlationId, 'KILL_SWITCH_TRIPPED', {
              code: decisionCode,
              reason: decisionReason,
              scope: 'BOT',
              targetId: handle.input.runId,
            }),
          )
          .catch((e) =>
            this.logger.error(`kill-switch trip failed: ${e.message}`),
          );
        await this.alerts
          .emit({
            kind: 'KILL_SWITCH_TRIPPED',
            severity: 'CRITICAL',
            subject: `Bot ${handle.input.runId} detenido: ${decisionCode}`,
            message: decisionReason ?? 'capital-guard trip',
            dedupeKey: `KILL_SWITCH:${handle.input.runId}:${decisionCode}`,
            botRunnerRunId: handle.dbRun.id,
            payload: {
              runId: handle.input.runId,
              strategyId: handle.input.strategyId,
              symbol: handle.input.symbol,
              equity: context.accountEquity,
              dailyPnl: context.dailyPnl,
              drawdownPct: context.currentDrawdownPct,
            },
            cooldownMinutes: 60,
          })
          .catch((e) => this.logger.warn(`alert emit failed: ${e.message}`));
      }
      return null;
    }
    const adjusted = result.adjustedSignal ?? signal;
    const wasAdjusted =
      JSON.stringify(this.signalPayload(adjusted)) !==
      JSON.stringify(this.signalPayload(signal));
    await this.trace(
      handle,
      correlationId,
      wasAdjusted ? 'RISK_ADJUSTED' : 'RISK_ALLOWED',
      {
        decision: result.decision,
        context,
        sizing: result.sizing,
        adjustedSignal: wasAdjusted ? this.signalPayload(adjusted) : undefined,
      },
    );
    return adjusted;
  }

  private async readEquity(exchange: IExchange): Promise<number> {
    const balance = await exchange.getBalance('SPOT').catch(() => null);
    if (!balance) return 0;
    return balance.balances.reduce((a, b) => a + b.total, 0);
  }

  /**
   * A diferencia de readEquity (total, incluye lo trabado en órdenes
   * abiertas), esto es lo realmente disponible para una orden nueva. Sin
   * esto, risk-manager comparaba el tamaño pedido contra equity total y
   * podía aprobar una señal que en la práctica no tiene fondos libres
   * porque ya están reservados en otras órdenes resting.
   */
  private async readFreeMargin(exchange: IExchange): Promise<number> {
    const balance = await exchange.getBalance('SPOT').catch(() => null);
    if (!balance) return 0;
    return balance.balances.reduce((a, b) => a + b.free, 0);
  }

  private async countPositions(exchange: IExchange): Promise<number> {
    const positions = await exchange
      .getPositions('SPOT' as MarketType)
      .catch(() => [] as Awaited<ReturnType<IExchange['getPositions']>>);
    return positions.filter((p) => p.quantity > 0 && p.side !== 'FLAT').length;
  }

  private async executeSignal(
    handle: RunnerHandle,
    signal: Signal,
    correlationId: string,
  ): Promise<void> {
    if (signal.action === 'CANCEL_ALL') {
      await this.trace(handle, correlationId, 'ORDER_REQUESTED', {
        operation: 'CANCEL_ALL',
        signal: this.signalPayload(signal),
      });
      try {
        const cancelled = await handle.exchange.cancelAllOrders(signal.symbol);
        await this.trace(handle, correlationId, 'ORDER_ACCEPTED', {
          operation: 'CANCEL_ALL',
          cancelled,
        });
      } catch (e: any) {
        await this.trace(handle, correlationId, 'ORDER_FAILED', {
          operation: 'CANCEL_ALL',
          error: e?.message ?? 'unknown error',
        });
        this.logger.warn(`cancelAll: ${e.message}`);
      }
      return;
    }
    if (!signal.side || !signal.type) {
      await this.trace(handle, correlationId, 'ORDER_FAILED', {
        error: 'signal requires side and type',
      });
      return;
    }
    const marketSnapshot = await handle.exchange
      .getTicker(signal.symbol)
      .catch(() => undefined);
    const expectedPrice = signal.price ?? marketSnapshot?.price;
    await this.trace(handle, correlationId, 'ORDER_REQUESTED', {
      signal: this.signalPayload(signal),
      exchangeId: handle.exchange.id,
      expectedPrice,
      bestBid: marketSnapshot?.bid,
      bestAsk: marketSnapshot?.ask,
    });
    const requestedAt = new Date();
    let order: Awaited<ReturnType<IExchange['placeOrder']>>;
    try {
      order = await handle.exchange.placeOrder({
        symbol: signal.symbol,
        side: signal.side,
        type: signal.type,
        quantity: signal.quantity,
        quoteQuantity: signal.quoteQuantity,
        price: signal.price,
        stopPrice: signal.stopPrice,
        timeInForce: signal.timeInForce,
        market: signal.market ?? 'SPOT',
        // correlationId es único por intento de orden (randomUUID por señal
        // emitida) y cabe en el límite de 36 chars de Binance: reusarlo como
        // clientOrderId hace la request idempotente ante un reintento con
        // resultado ambiguo (timeout, red cortada) en vez de arriesgar una
        // orden duplicada.
        clientOrderId: correlationId,
      });
    } catch (e: any) {
      const respondedAt = new Date();
      await this.persistExecutionMetric(handle, {
        correlationId,
        signal,
        marketSnapshot,
        expectedPrice,
        status: 'REJECTED',
        requestedAt,
        respondedAt,
        errorCode: e?.code === undefined ? undefined : String(e.code),
        errorMessage: e?.message ?? 'unknown error',
      });
      await this.trace(handle, correlationId, 'ORDER_FAILED', {
        error: e?.message ?? 'unknown error',
        code: e?.code,
      });
      await this.alerts
        .emit({
          kind: 'ORDER_FAILED',
          severity: 'ERROR',
          subject: `Orden fallida ${signal.symbol} (${handle.input.runId})`,
          message: e?.message ?? 'unknown error',
          dedupeKey: `ORDER_FAILED:${handle.input.runId}:${signal.symbol}:${e?.code ?? 'ERR'}`,
          botRunnerRunId: handle.dbRun.id,
          payload: {
            runId: handle.input.runId,
            symbol: signal.symbol,
            side: signal.side,
            type: signal.type,
            errorCode: e?.code,
          },
          cooldownMinutes: 15,
        })
        .catch((err) => this.logger.warn(`alert emit failed: ${err.message}`));
      if (handle.strategy.onOrderFailed) {
        await handle.strategy.onOrderFailed(handle.ctx, signal);
      }
      this.onErr(handle, e);
      return;
    }
    const respondedAt = new Date();
    const fillPrice = order.averagePrice || order.price || undefined;
    const quality = this.executionQuality(
      signal.side,
      expectedPrice,
      fillPrice,
      order.filledQuantity,
      marketSnapshot,
    );
    await this.persistExecutionMetric(handle, {
      correlationId,
      signal,
      marketSnapshot,
      expectedPrice,
      status: order.status,
      requestedAt,
      respondedAt,
      orderId: order.id,
      fillPrice,
      filledQuantity: order.filledQuantity,
      requestedQuantity: order.quantity,
      fee: order.fee,
      feeCurrency: order.feeCurrency,
    });

    handle.status.ordersPlaced += 1;
    await this.repo
      .touchStats(handle.input.runId, { ordersPlaced: 1 })
      .catch(() => undefined);
    this.logger.log(
      `[${handle.input.runId}] ${signal.action} ${signal.side} ${signal.symbol} order=${order.id} status=${order.status}`,
    );
    await this.trace(
      handle,
      correlationId,
      order.status === 'FILLED' ? 'ORDER_FILLED' : 'ORDER_ACCEPTED',
      {
        status: order.status,
        price: order.price,
        averagePrice: order.averagePrice,
        quantity: order.quantity,
        filledQuantity: order.filledQuantity,
        fee: order.fee,
        feeCurrency: order.feeCurrency,
        latencyMs: respondedAt.getTime() - requestedAt.getTime(),
        ...quality,
      },
      order.id,
    );

    if (order.status === 'FILLED') {
      await this.recordTrade(
        handle,
        signal,
        order.id,
        order.averagePrice || order.price,
        order.filledQuantity,
        correlationId,
        order.fee ?? 0,
      );
      if (handle.strategy.onOrderFilled) {
        await handle.strategy.onOrderFilled(handle.ctx);
      }
    } else if (order.status === 'NEW' || order.status === 'PARTIALLY_FILLED') {
      // LIMIT/LIMIT_MAKER resting: el exchange la aceptó pero no llenó
      // todavía. Sin esto quedaba viva en el exchange para siempre sin que
      // nada acá la volviera a mirar — nunca se abría el trade y nunca se
      // cancelaba por vieja.
      const maxAgeMs = Number(
        handle.input.config?.maxOrderAgeMs ?? DEFAULT_MAX_ORDER_AGE_MS,
      );
      handle.pendingOrders.set(order.id, {
        symbol: signal.symbol,
        market: signal.market ?? 'SPOT',
        signal,
        correlationId,
        placedAt: Date.now(),
        maxAgeMs,
      });
    }
  }

  /**
   * Revisa cada orden resting (LIMIT/LIMIT_MAKER NEW/PARTIALLY_FILLED):
   * si llenó, recién ahí se abre/cierra el trade (antes nunca pasaba);
   * si lleva más de maxAgeMs sin llenar, se cancela — un fill parcial
   * antes de cancelar igual se registra por la cantidad que sí llenó.
   */
  private async reconcilePendingOrders(handle: RunnerHandle): Promise<void> {
    for (const [orderId, pending] of [...handle.pendingOrders.entries()]) {
      let order: Order;
      try {
        order = await handle.exchange.getOrder(
          pending.symbol,
          orderId,
          pending.market,
        );
      } catch (e: any) {
        this.logger.warn(
          `[${handle.input.runId}] getOrder ${orderId} failed: ${e?.message ?? e}`,
        );
        continue;
      }

      if (order.status === 'FILLED') {
        handle.pendingOrders.delete(orderId);
        await this.trace(handle, pending.correlationId, 'ORDER_FILLED', {
          status: order.status,
          averagePrice: order.averagePrice,
          filledQuantity: order.filledQuantity,
          fee: order.fee,
          resting: true,
        });
        await this.recordTrade(
          handle,
          pending.signal,
          order.id,
          order.averagePrice || order.price,
          order.filledQuantity,
          pending.correlationId,
          order.fee ?? 0,
        );
        if (handle.strategy.onOrderFilled) {
          await handle.strategy.onOrderFilled(handle.ctx);
        }
        continue;
      }

      if (
        order.status === 'CANCELED' ||
        order.status === 'REJECTED' ||
        order.status === 'EXPIRED'
      ) {
        handle.pendingOrders.delete(orderId);
        if (order.filledQuantity > 0) {
          // Fill parcial antes de desaparecer de la orderbook: no perder
          // esa porción solo porque el estado final no es FILLED.
          await this.recordTrade(
            handle,
            pending.signal,
            order.id,
            order.averagePrice || order.price,
            order.filledQuantity,
            pending.correlationId,
            order.fee ?? 0,
          );
        } else if (handle.strategy.onOrderFailed) {
          await handle.strategy.onOrderFailed(handle.ctx, pending.signal);
        }
        continue;
      }

      const age = Date.now() - pending.placedAt;
      if (age < pending.maxAgeMs) continue;
      await this.cancelPendingOrder(
        handle,
        orderId,
        pending,
        'stale resting order cancelled',
      );
    }
  }

  /** Cancela una orden resting puntual y, si alcanzó a llenar parcialmente antes de cancelarse, registra esa porción como trade en vez de perderla. */
  private async cancelPendingOrder(
    handle: RunnerHandle,
    orderId: string,
    pending: PendingOrder,
    reason: string,
  ): Promise<void> {
    try {
      const cancelled = await handle.exchange.cancelOrder(
        pending.symbol,
        orderId,
        pending.market,
      );
      handle.pendingOrders.delete(orderId);
      await this.trace(handle, pending.correlationId, 'ORDER_FAILED', {
        reason,
        ageMs: Date.now() - pending.placedAt,
        filledQuantity: cancelled.filledQuantity,
      });
      if (cancelled.filledQuantity > 0) {
        await this.recordTrade(
          handle,
          pending.signal,
          cancelled.id,
          cancelled.averagePrice || cancelled.price,
          cancelled.filledQuantity,
          pending.correlationId,
          cancelled.fee ?? 0,
        );
      } else if (handle.strategy.onOrderFailed) {
        await handle.strategy.onOrderFailed(handle.ctx, pending.signal);
      }
    } catch (e: any) {
      this.logger.warn(
        `[${handle.input.runId}] cancelOrder ${orderId} failed: ${e?.message ?? e}`,
      );
    }
  }

  private async recordTrade(
    handle: RunnerHandle,
    signal: Signal,
    orderId: string,
    fillPrice: number,
    quantity: number,
    correlationId: string,
    fee: number,
  ): Promise<void> {
    if (!signal.side || quantity <= 0) return;
    const isOpen = signal.action === 'OPEN' || signal.action === 'ADJUST';
    const isClose = signal.action === 'CLOSE';

    if (isOpen) {
      const tradeRegime = this.regimeFromSignal(signal);
      const timeframe = this.timeframeFromSignal(signal);
      const openTradeInput = {
        botRunnerRunId: handle.dbRun.id,
        orderId,
        symbol: signal.symbol,
        side: signal.side as OrderSide,
        entryPrice: fillPrice,
        quantity,
        fee,
        stopLossPrice: signal.stopLossPrice,
        reason: signal.reason,
        marketRegime: tradeRegime?.regime,
        regimeConfidence: tradeRegime?.confidence,
        regimeSnapshot: tradeRegime?.snapshot,
        timeframeScore: timeframe?.score,
        timeframeSnapshot: timeframe?.snapshot,
      };
      let trade = await this.repo.openTrade(openTradeInput).catch((e) => {
        this.logger.warn(`openTrade persist (intento 1): ${e.message}`);
        return null;
      });
      if (!trade) {
        await new Promise((r) => setTimeout(r, 1000));
        trade = await this.repo.openTrade(openTradeInput).catch((e) => {
          this.logger.warn(`openTrade persist (reintento): ${e.message}`);
          return null;
        });
      }
      if (!trade) {
        // La orden SÍ se llenó en el exchange pero quedó sin traza de trade
        // en DB tras 2 intentos: no hay auto-reparación posible acá (regla
        // de reconciliación), así que se alerta como CRÍTICO para revisión
        // manual en vez de tragarse el error.
        await this.alerts
          .emit({
            kind: 'ORDER_FILLED_WITHOUT_TRADE',
            severity: 'CRITICAL',
            subject: `Fill sin trade persistido: ${signal.symbol} (run ${handle.input.runId})`,
            message:
              'openTrade() falló 2 veces tras un ORDER_FILLED real. Requiere revisión manual (posible posición huérfana).',
            dedupeKey: `ORDER_FILLED_WITHOUT_TRADE:${orderId}`,
            botRunnerRunId: handle.dbRun.id,
            payload: {
              runId: handle.input.runId,
              strategyId: handle.input.strategyId,
              symbol: signal.symbol,
              side: signal.side,
              orderId,
              fillPrice,
              quantity,
              correlationId,
            },
            cooldownMinutes: 0,
          })
          .catch((e) => this.logger.error(`alert emit failed: ${e.message}`));
      }
      if (trade) {
        await this.trace(
          handle,
          correlationId,
          'TRADE_OPENED',
          {
            side: trade.side,
            entryPrice: Number(trade.entryPrice),
            quantity: Number(trade.quantity),
            reason: trade.reason,
            marketRegime: trade.marketRegime,
            regimeConfidence: trade.regimeConfidence,
          },
          orderId,
          trade.id,
        );
        const side = signal.side === OrderSide.BUY ? 'LONG' : 'SHORT';
        if (handle.trailingConfig) {
          handle.trailingStates.set(trade.id, {
            state: initTrailingStop(side, fillPrice),
            quantity,
            symbol: signal.symbol,
            side: signal.side as OrderSide,
          });
        }
        if (handle.tpLadderConfig) {
          handle.tpLadderStates.set(trade.id, {
            state: initTpLadder(side, fillPrice, quantity),
            symbol: signal.symbol,
            side: signal.side as OrderSide,
          });
        }
      }
      return;
    }

    if (isClose) {
      const opposite: OrderSide =
        signal.side === 'BUY' ? OrderSide.SELL : OrderSide.BUY;
      const openTrade = await this.repo.findOpenTrade(
        handle.dbRun.id,
        signal.symbol,
        opposite,
      );
      if (openTrade) {
        handle.trailingStates.delete(openTrade.id);
        handle.tpLadderStates.delete(openTrade.id);
      }
      if (!openTrade) {
        this.logger.warn(
          `[${handle.input.runId}] CLOSE without matching open trade ${signal.symbol}`,
        );
        await this.alerts
          .emit({
            kind: 'ORDER_FILLED_WITHOUT_TRADE',
            severity: 'CRITICAL',
            subject: `Fill de cierre sin trade abierto: ${signal.symbol} (run ${handle.input.runId})`,
            message:
              'Llegó un fill de CLOSE pero no hay trade abierto que le corresponda en DB. Requiere revisión manual.',
            dedupeKey: `ORDER_FILLED_WITHOUT_TRADE:${orderId}`,
            botRunnerRunId: handle.dbRun.id,
            payload: {
              runId: handle.input.runId,
              strategyId: handle.input.strategyId,
              symbol: signal.symbol,
              side: signal.side,
              orderId,
              fillPrice,
              quantity,
              correlationId,
            },
            cooldownMinutes: 0,
          })
          .catch((e) => this.logger.error(`alert emit failed: ${e.message}`));
        return;
      }
      const closeTradeInput = {
        tradeId: openTrade.id,
        orderId,
        exitPrice: fillPrice,
        additionalFee: fee,
        reason: signal.reason,
      };
      let closed = await this.repo.closeTrade(closeTradeInput).catch((e) => {
        this.logger.warn(`closeTrade persist (intento 1): ${e.message}`);
        return null;
      });
      if (!closed) {
        await new Promise((r) => setTimeout(r, 1000));
        closed = await this.repo.closeTrade(closeTradeInput).catch((e) => {
          this.logger.warn(`closeTrade persist (reintento): ${e.message}`);
          return null;
        });
      }
      if (!closed) {
        await this.alerts
          .emit({
            kind: 'ORDER_FILLED_WITHOUT_TRADE',
            severity: 'CRITICAL',
            subject: `Fill de cierre sin persistir: ${signal.symbol} (run ${handle.input.runId})`,
            message:
              'closeTrade() falló 2 veces tras un ORDER_FILLED real de cierre. El trade sigue abierto en DB pero la posición ya se cerró en el exchange. Requiere revisión manual.',
            dedupeKey: `ORDER_FILLED_WITHOUT_TRADE:${orderId}`,
            botRunnerRunId: handle.dbRun.id,
            payload: {
              runId: handle.input.runId,
              strategyId: handle.input.strategyId,
              symbol: signal.symbol,
              side: signal.side,
              orderId,
              tradeId: openTrade.id,
              fillPrice,
              quantity,
              correlationId,
            },
            cooldownMinutes: 0,
          })
          .catch((e) => this.logger.error(`alert emit failed: ${e.message}`));
      }
      if (closed?.pnl) {
        const pnl = Number(closed.pnl);
        handle.realizedPnl += pnl;
        handle.status.realizedPnl = handle.realizedPnl;
        await this.repo
          .touchStats(handle.input.runId, {
            realizedPnl: handle.realizedPnl,
            dailyPnl: await this.repo
              .computeDailyPnl(handle.dbRun.id)
              .catch(() => handle.dailyPnl),
          })
          .catch(() => undefined);
      }
      if (closed) {
        await this.trace(
          handle,
          correlationId,
          'TRADE_CLOSED',
          {
            entryPrice: Number(closed.entryPrice),
            exitPrice: Number(closed.exitPrice),
            quantity: Number(closed.quantity),
            pnl: Number(closed.pnl),
            pnlPct: Number(closed.pnlPct),
            fees: Number(closed.fee),
            mae: closed.mae === null ? null : Number(closed.mae),
            mfe: closed.mfe === null ? null : Number(closed.mfe),
            reason: closed.reason,
          },
          orderId,
          closed.id,
        );
        await this.emitCloseCapitalEvents(handle, closed, correlationId);
      }
    }
  }

  private signalPayload(signal: Signal): Record<string, unknown> {
    return {
      action: signal.action,
      symbol: signal.symbol,
      side: signal.side,
      type: signal.type,
      quantity: signal.quantity,
      quoteQuantity: signal.quoteQuantity,
      price: signal.price,
      stopPrice: signal.stopPrice,
      takeProfitPrice: signal.takeProfitPrice,
      stopLossPrice: signal.stopLossPrice,
      timeInForce: signal.timeInForce,
      market: signal.market,
      reason: signal.reason,
      confidence: signal.confidence,
      metadata: signal.metadata,
      emittedAt: signal.emittedAt,
    };
  }

  private regimeFilter(
    config: Record<string, unknown>,
  ): RegimeFilterConfig | undefined {
    const raw = config.regimeFilter;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    const strings = (entry: unknown): string[] | undefined =>
      Array.isArray(entry)
        ? entry.filter((item): item is string => typeof item === 'string')
        : undefined;
    return {
      enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
      allowedRegimes: strings(value.allowedRegimes),
      allowedTrends: strings(
        value.allowedTrends,
      ) as RegimeFilterConfig['allowedTrends'],
      blockedVolatility: strings(
        value.blockedVolatility,
      ) as RegimeFilterConfig['blockedVolatility'],
      minConfidence:
        typeof value.minConfidence === 'number'
          ? Math.max(0, Math.min(100, value.minConfidence))
          : undefined,
      allowUnknown:
        typeof value.allowUnknown === 'boolean' ? value.allowUnknown : false,
    };
  }

  private priceForecastFilter(config: Record<string, unknown>):
    | {
        enabled: boolean;
        horizonBars: number;
        maxDivergencePct: number;
        allowInsufficientData: boolean;
        sizeConfidence?: ConfidenceMultiplierConfig;
      }
    | undefined {
    const raw = config.priceForecast;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    const sizeRaw = value.sizeConfidence;
    const sizeConfidence =
      sizeRaw && typeof sizeRaw === 'object' && !Array.isArray(sizeRaw)
        ? this.priceForecastSizeConfidence(sizeRaw as Record<string, unknown>)
        : undefined;
    return {
      enabled: value.enabled === true,
      horizonBars:
        typeof value.horizonBars === 'number' &&
        Number.isInteger(value.horizonBars) &&
        value.horizonBars > 0
          ? value.horizonBars
          : 5,
      maxDivergencePct:
        typeof value.maxDivergencePct === 'number' && value.maxDivergencePct > 0
          ? value.maxDivergencePct
          : 1,
      allowInsufficientData: value.allowInsufficientData !== false,
      sizeConfidence,
    };
  }

  private priceForecastSizeConfidence(
    value: Record<string, unknown>,
  ): ConfidenceMultiplierConfig | undefined {
    if (value.enabled !== true) return undefined;
    return {
      minSampleSize:
        typeof value.minSampleSize === 'number' && value.minSampleSize > 0
          ? value.minSampleSize
          : 30,
      floorMultiplier:
        typeof value.floorMultiplier === 'number' && value.floorMultiplier > 0
          ? value.floorMultiplier
          : 0.25,
      ceilingMultiplier:
        typeof value.ceilingMultiplier === 'number' && value.ceilingMultiplier >= 1
          ? value.ceilingMultiplier
          : 1.5,
    };
  }

  private regimeFromSignal(signal: Signal):
    | {
        regime: string;
        confidence: number;
        snapshot: Record<string, unknown>;
      }
    | undefined {
    const raw = signal.metadata?.marketRegime;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const snapshot = raw as Record<string, unknown>;
    if (
      typeof snapshot.regime !== 'string' ||
      typeof snapshot.confidence !== 'number'
    ) {
      return undefined;
    }
    return {
      regime: snapshot.regime,
      confidence: snapshot.confidence,
      snapshot,
    };
  }

  private multiTimeframeConfig(
    config: Record<string, unknown>,
  ): MultiTimeframeConfig | undefined {
    const raw = config.multiTimeframe;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const value = raw as Record<string, unknown>;
    if (!Array.isArray(value.contexts)) return undefined;
    const contexts = value.contexts.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const entry = item as Record<string, unknown>;
      if (typeof entry.timeframe !== 'string') return [];
      return [
        {
          timeframe: entry.timeframe,
          weight:
            typeof entry.weight === 'number' ? Math.max(entry.weight, 0.1) : 1,
        },
      ];
    });
    return {
      enabled: value.enabled !== false,
      contexts,
      minScore: typeof value.minScore === 'number' ? value.minScore : 60,
      minConfidence:
        typeof value.minConfidence === 'number' ? value.minConfidence : 50,
      allowUnknown: value.allowUnknown === true,
      warmupBars: typeof value.warmupBars === 'number' ? value.warmupBars : 100,
    };
  }

  private timeframeFromSignal(
    signal: Signal,
  ): { score: number; snapshot: Record<string, unknown> } | undefined {
    const raw = signal.metadata?.multiTimeframe;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const snapshot = raw as Record<string, unknown>;
    if (typeof snapshot.score !== 'number') return undefined;
    return { score: snapshot.score, snapshot };
  }

  private executionQuality(
    side: 'BUY' | 'SELL',
    expectedPrice: number | undefined,
    fillPrice: number | undefined,
    filledQuantity: number | undefined,
    ticker: Ticker | undefined,
  ): {
    spreadBps?: number;
    slippageBps?: number;
    slippageQuote?: number;
    notional?: number;
  } {
    const mid =
      ticker?.bid && ticker?.ask ? (ticker.bid + ticker.ask) / 2 : undefined;
    const spreadBps =
      mid && mid > 0 && ticker?.bid !== undefined && ticker.ask !== undefined
        ? ((ticker.ask - ticker.bid) / mid) * 10_000
        : undefined;
    if (!expectedPrice || expectedPrice <= 0 || !fillPrice || fillPrice <= 0) {
      return { spreadBps };
    }
    const adversePrice =
      side === 'BUY' ? fillPrice - expectedPrice : expectedPrice - fillPrice;
    return {
      spreadBps,
      slippageBps: (adversePrice / expectedPrice) * 10_000,
      slippageQuote:
        filledQuantity === undefined
          ? undefined
          : adversePrice * filledQuantity,
      notional:
        filledQuantity === undefined ? undefined : fillPrice * filledQuantity,
    };
  }

  private async persistExecutionMetric(
    handle: RunnerHandle,
    input: {
      correlationId: string;
      signal: Signal;
      marketSnapshot?: Ticker;
      expectedPrice?: number;
      status: string;
      requestedAt: Date;
      respondedAt: Date;
      orderId?: string;
      fillPrice?: number;
      requestedQuantity?: number;
      filledQuantity?: number;
      fee?: number;
      feeCurrency?: string;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    if (!input.signal.side || !input.signal.type) return;
    const quality = this.executionQuality(
      input.signal.side,
      input.expectedPrice,
      input.fillPrice,
      input.filledQuantity,
      input.marketSnapshot,
    );
    await this.repo
      .createExecutionMetric({
        botRunnerRunId: handle.dbRun.id,
        correlationId: input.correlationId,
        orderId: input.orderId,
        exchange: handle.exchange.id,
        mode: handle.input.exchange.mode,
        symbol: input.signal.symbol,
        side: input.signal.side as OrderSide,
        orderType: input.signal.type,
        market: input.signal.market ?? 'SPOT',
        status: input.status,
        expectedPrice: input.expectedPrice,
        bestBid: input.marketSnapshot?.bid,
        bestAsk: input.marketSnapshot?.ask,
        spreadBps: quality.spreadBps,
        requestedQuantity: input.requestedQuantity ?? input.signal.quantity,
        filledQuantity: input.filledQuantity,
        fillPrice: input.fillPrice,
        notional: quality.notional,
        fee: input.fee,
        feeCurrency: input.feeCurrency,
        slippageBps: quality.slippageBps,
        slippageQuote: quality.slippageQuote,
        latencyMs: input.respondedAt.getTime() - input.requestedAt.getTime(),
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        requestedAt: input.requestedAt,
        respondedAt: input.respondedAt,
      })
      .catch((error: Error) =>
        this.logger.error(
          `[${handle.input.runId}] execution metric persist failed: ${error.message}`,
        ),
      );
  }

  private async trace(
    handle: RunnerHandle,
    correlationId: string,
    eventType: string,
    payload: Record<string, unknown>,
    orderId?: string,
    tradeId?: number,
  ): Promise<void> {
    try {
      await this.repo.createTrace({
        botRunnerRunId: handle.dbRun.id,
        correlationId,
        eventType,
        symbol: handle.input.symbol,
        orderId,
        tradeId,
        payload,
      });
    } catch (e) {
      // A trace-write failure must never abort the signal/order pipeline
      // (e.g. it would otherwise throw before recordTrade() runs for an
      // order that already FILLED on the exchange, producing exactly the
      // "FILLED order without trade trace" critical incident CLAUDE.md
      // warns about). Surface it loudly instead of swallowing it, per the
      // "no ocultar errores de persistencia" rule.
      this.logger.error(
        `runner ${handle.input.runId} failed to persist trace ${eventType} (correlationId=${correlationId}): ${(e as Error).message}`,
      );
    }
  }

  private async placeProtectiveOrder(
    handle: RunnerHandle,
    input: {
      symbol: string;
      side: OrderSide;
      quantity: number;
      reason: string;
    },
  ): Promise<{
    order: Awaited<ReturnType<IExchange['placeOrder']>>;
    correlationId: string;
  }> {
    const correlationId = randomUUID();
    const signal: Signal = {
      action: 'CLOSE',
      symbol: input.symbol,
      side: input.side,
      type: 'MARKET',
      quantity: input.quantity,
      market: 'SPOT',
      reason: input.reason,
      metadata: { source: 'PROTECTIVE_EXIT' },
      emittedAt: Date.now(),
    };
    await this.trace(handle, correlationId, 'SIGNAL_EMITTED', {
      signal: this.signalPayload(signal),
    });
    // Exits are intentionally never blocked by risk gating (closing exposure
    // must always be allowed, even mid kill-switch). Record the real
    // kill-switch state here instead of a blind "allowed: true" so the
    // trace is honest about what was (and wasn't) evaluated.
    const killSwitchActive = await this.risk
      .isKilled('BOT', handle.input.runId)
      .catch(() => false);
    await this.trace(handle, correlationId, 'RISK_ALLOWED', {
      decision: {
        allowed: true,
        code: 'PROTECTIVE_EXIT',
        reason:
          'closing exposure is never blocked by risk gating, even while the kill switch is active',
        killSwitchActive,
      },
    });
    const marketSnapshot = await handle.exchange
      .getTicker(input.symbol)
      .catch(() => undefined);
    const expectedPrice = marketSnapshot?.price;
    await this.trace(handle, correlationId, 'ORDER_REQUESTED', {
      signal: this.signalPayload(signal),
      expectedPrice,
      bestBid: marketSnapshot?.bid,
      bestAsk: marketSnapshot?.ask,
    });
    const requestedAt = new Date();
    try {
      const order = await handle.exchange.placeOrder({
        symbol: input.symbol,
        side: input.side,
        type: 'MARKET',
        quantity: input.quantity,
        market: 'SPOT',
      });
      const respondedAt = new Date();
      const fillPrice = order.averagePrice || order.price || undefined;
      const quality = this.executionQuality(
        input.side,
        expectedPrice,
        fillPrice,
        order.filledQuantity,
        marketSnapshot,
      );
      await this.persistExecutionMetric(handle, {
        correlationId,
        signal,
        marketSnapshot,
        expectedPrice,
        status: order.status,
        requestedAt,
        respondedAt,
        orderId: order.id,
        fillPrice,
        requestedQuantity: order.quantity,
        filledQuantity: order.filledQuantity,
        fee: order.fee,
        feeCurrency: order.feeCurrency,
      });
      await this.trace(
        handle,
        correlationId,
        order.status === 'FILLED' ? 'ORDER_FILLED' : 'ORDER_ACCEPTED',
        {
          status: order.status,
          fillPrice,
          filledQuantity: order.filledQuantity,
          fee: order.fee,
          latencyMs: respondedAt.getTime() - requestedAt.getTime(),
          ...quality,
        },
        order.id,
      );
      return { order, correlationId };
    } catch (error: unknown) {
      const respondedAt = new Date();
      const err = error instanceof Error ? error : new Error(String(error));
      await this.persistExecutionMetric(handle, {
        correlationId,
        signal,
        marketSnapshot,
        expectedPrice,
        status: 'REJECTED',
        requestedAt,
        respondedAt,
        errorMessage: err.message,
      });
      await this.trace(handle, correlationId, 'ORDER_FAILED', {
        error: err.message,
      });
      throw err;
    }
  }

  private async updateOpenTradeExtremes(
    handle: RunnerHandle,
    price: number,
  ): Promise<void> {
    const openTrades = await this.repo.listOpenTrades(handle.dbRun.id);
    for (const t of openTrades) {
      await this.repo.updateTradeExtremes(t.id, price);
    }
  }

  private async checkTrailingStops(
    handle: RunnerHandle,
    candle: Candle,
  ): Promise<void> {
    if (!handle.trailingConfig) return;
    const history = handle.ctx.history();
    for (const [tradeId, entry] of Array.from(
      handle.trailingStates.entries(),
    )) {
      const { state, quantity, symbol, side } = entry;
      const { triggered, stopPrice } = updateTrailingStop(
        state,
        candle,
        history,
        handle.trailingConfig,
      );
      if (!triggered) continue;

      const opposite: OrderSide =
        side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
      try {
        const { order, correlationId } = await this.placeProtectiveOrder(
          handle,
          {
            symbol,
            side: opposite,
            quantity,
            reason: `trailingStop@${stopPrice?.toFixed(6) ?? candle.close}`,
          },
        );
        const fillPrice = order.averagePrice || order.price || candle.close;
        handle.status.ordersPlaced += 1;
        const closedTrail = await this.repo
          .closeTrade({
            tradeId,
            orderId: order.id,
            exitPrice: fillPrice,
            additionalFee: order.fee ?? 0,
            reason: `trailingStop@${stopPrice?.toFixed(6) ?? candle.close}`,
          })
          .catch((e) => {
            this.logger.warn(`trailingStop closeTrade: ${e.message}`);
            return null;
          });
        if (!closedTrail) {
          // The exchange order already filled but the DB close write
          // failed. Keep trailingStates so the position stays supervised
          // and the close is retried on the next candle instead of being
          // silently abandoned OPEN-in-DB / FLAT-on-exchange.
          this.logger.warn(
            `[${handle.input.runId}] trailingStop close persist failed for trade=${tradeId}; will retry next tick`,
          );
          continue;
        }
        await this.emitCloseCapitalEvents(handle, closedTrail, correlationId);
        await this.trace(handle, correlationId, 'TRADE_CLOSED', {
          entryPrice: Number(closedTrail.entryPrice),
          exitPrice: Number(closedTrail.exitPrice),
          quantity: Number(closedTrail.quantity),
          pnl: Number(closedTrail.pnl),
          fees: Number(closedTrail.fee),
          reason: `trailingStop@${stopPrice?.toFixed(6) ?? candle.close}`,
        });
        handle.trailingStates.delete(tradeId);
        this.logger.log(
          `[${handle.input.runId}] trailingStop triggered trade=${tradeId} stop=${stopPrice} exit=${fillPrice}`,
        );
      } catch (e: any) {
        this.logger.warn(`trailingStop place order fail: ${e.message}`);
      }
    }
  }

  private async checkTpLadders(
    handle: RunnerHandle,
    candle: Candle,
  ): Promise<void> {
    if (!handle.tpLadderConfig) return;
    for (const [tradeId, entry] of Array.from(
      handle.tpLadderStates.entries(),
    )) {
      const { state, symbol, side } = entry;
      const decision = evaluateTpLadder(
        state,
        candle.close,
        handle.tpLadderConfig,
      );
      if (!decision) continue;

      const opposite: OrderSide =
        side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
      try {
        const { order, correlationId } = await this.placeProtectiveOrder(
          handle,
          {
            symbol,
            side: opposite,
            quantity: decision.quantity,
            reason: `tpLadder@L${decision.levelIndex}`,
          },
        );
        handle.status.ordersPlaced += 1;
        this.logger.log(
          `[${handle.input.runId}] tpLadder fill trade=${tradeId} level=${decision.levelIndex} qty=${decision.quantity} target=${decision.targetPrice}`,
        );

        const fillPrice = order.averagePrice || order.price || candle.close;
        const fillFee = order.fee ?? 0;

        if (isTpLadderComplete(state, handle.tpLadderConfig)) {
          const closedTp = await this.repo
            .closeTrade({
              tradeId,
              orderId: order.id,
              exitPrice: fillPrice,
              additionalFee: fillFee,
              reason: `tpLadder-complete@L${decision.levelIndex}`,
            })
            .catch((e) => {
              this.logger.warn(`tpLadder close trade: ${e.message}`);
              return null;
            });
          if (!closedTp) {
            // Same rationale as checkTrailingStops: don't drop supervision
            // state when the DB close write failed after the exchange
            // order already filled — retry on the next tick instead.
            this.logger.warn(
              `[${handle.input.runId}] tpLadder close persist failed for trade=${tradeId}; will retry next tick`,
            );
            continue;
          }
          await this.emitCloseCapitalEvents(handle, closedTp, correlationId);
          await this.trace(handle, correlationId, 'TRADE_CLOSED', {
            entryPrice: Number(closedTp.entryPrice),
            exitPrice: Number(closedTp.exitPrice),
            quantity: Number(closedTp.quantity),
            pnl: Number(closedTp.pnl),
            fees: Number(closedTp.fee),
            reason: `tpLadder-complete@L${decision.levelIndex}`,
          });
          handle.tpLadderStates.delete(tradeId);
          handle.trailingStates.delete(tradeId);
        } else {
          // Fill parcial (no es el último nivel): registrar el pnl de ESTA
          // porción nada más -- sin esto, closeTrade() en el nivel final
          // termina valuando el 100% de la posición al precio del último
          // nivel (el mejor), sobreestimando el pnl real del trade.
          const partial = await this.repo
            .recordPartialClose({
              tradeId,
              exitPrice: fillPrice,
              quantity: decision.quantity,
              fee: fillFee,
            })
            .catch((e) => {
              this.logger.warn(`tpLadder recordPartialClose: ${e.message}`);
              return null;
            });
          if (partial) {
            await this.emitCloseCapitalEvents(
              handle,
              {
                id: tradeId,
                pnl: partial.pnl,
                fee: partial.fee,
                symbol,
                side,
              },
              correlationId,
            );
            await this.trace(handle, correlationId, 'TRADE_PARTIAL_CLOSED', {
              level: decision.levelIndex,
              exitPrice: fillPrice,
              quantity: decision.quantity,
              pnl: partial.pnl,
              fee: partial.fee,
            });
            // Si también hay trailingStop en el mismo trade, su
            // `quantity` quedó fijada en initTrailingStop() con el tamaño
            // ORIGINAL completo y nunca se enteraba de que tpLadder ya
            // vendió una porción -- sin este ajuste, un trailing-stop que
            // dispare después intentaría cerrar MÁS cantidad de la que
            // realmente queda abierta (orden de venta sobre balance que no
            // existe).
            const trailing = handle.trailingStates.get(tradeId);
            if (trailing) {
              trailing.quantity = Math.max(
                0,
                trailing.quantity - decision.quantity,
              );
            }
          }
        }
      } catch (e: any) {
        this.logger.warn(`tpLadder place order fail: ${e.message}`);
      }
    }
  }

  private async snapshot(handle: RunnerHandle): Promise<void> {
    const equity = handle.currentEquity;
    const drawdown =
      handle.peakEquity > 0
        ? ((handle.peakEquity - equity) / handle.peakEquity) * 100
        : 0;
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
