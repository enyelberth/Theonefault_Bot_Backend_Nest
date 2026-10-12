import type { RiskProfile } from '@prisma/client';
import type { Candle, Signal, Timeframe } from '../../exchanges/domain';
import type { IStrategy } from '../../strategies/v2/strategy.interface';
import { InMemoryStrategyContext } from '../../strategies/v2/in-memory-context';
import type { IExchange } from '../../exchanges/exchange.interface';
import { buildEquityCurve, computeMetrics } from '../metrics/calculator';
import type {
  BacktestMetrics,
  EquityPoint,
  SimulatedTrade,
} from '../metrics/types';
import { DEFAULT_FEES, FeesConfig, applyFee, fillPriceForMarket } from './fees';
import { applyEntryFilters, type EntryFilterConfig } from './filters';
import { RiskManagerService } from '../../risk/risk-manager.service';
import { buildRiskContext } from '../../risk/risk-context-builder';

export interface SimulatorInput<TConfig> {
  strategy: IStrategy<TConfig>;
  strategyId: string;
  config: TConfig;
  candles: Candle[];
  symbol: string;
  timeframe: Timeframe;
  initialQuote: number;
  exchange: IExchange;
  fees?: FeesConfig;
  warmupBars?: number;
  /**
   * Velas de timeframes extra (ej. 1h/4h) para todo el rango del backtest,
   * usadas por config.multiTimeframe / config.confluenceFilter -- si una
   * de esas claves está habilitada en config pero el timeframe que pide no
   * está acá, ese contexto extra simplemente se omite (igual que en vivo
   * cuando no hay datos todavía).
   */
  extraTimeframeCandles?: Record<string, Candle[]>;
}

export interface SimulatorResult {
  trades: SimulatedTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
  /** Señales OPEN que la estrategia emitió pero que regimeFilter/multiTimeframe/priceForecast/confluenceFilter/riskProfile bloquearon antes de ejecutarse. */
  filteredSignals: number;
}

interface OpenPosition {
  side: 'BUY' | 'SELL';
  entryTime: number;
  entryPrice: number;
  quantity: number;
  entryBar: number;
  entryFees: number;
}

export async function runBacktest<TConfig>(
  input: SimulatorInput<TConfig>,
): Promise<SimulatorResult> {
  const {
    strategy,
    strategyId,
    config,
    candles,
    symbol,
    timeframe,
    initialQuote,
    exchange,
    fees = DEFAULT_FEES,
    warmupBars = 0,
    extraTimeframeCandles = {},
  } = input;

  if (candles.length === 0) {
    const metrics = computeMetrics([], [], initialQuote, 0, 0);
    return { trades: [], equityCurve: [], metrics, filteredSignals: 0 };
  }

  const ctx = new InMemoryStrategyContext<TConfig>({
    strategyId,
    symbol,
    timeframe,
    config,
    exchange,
    historyLimit: 1000,
  });

  // config es el mismo blob plano que BotRunnerRun.config en vivo --
  // regimeFilter/multiTimeframe/priceForecast/confluenceFilter/riskProfile
  // son opcionales y, si están ausentes, el backtest se comporta exactamente
  // igual que antes de que existiera este bloque.
  const rawConfig = config as unknown as Record<string, unknown>;
  const entryFilterConfig = rawConfig as unknown as EntryFilterConfig;
  const hasEntryFilters = Boolean(
    (entryFilterConfig.regimeFilter as { enabled?: boolean } | undefined)?.enabled ||
      (entryFilterConfig.multiTimeframe as { enabled?: boolean } | undefined)?.enabled ||
      (entryFilterConfig.priceForecast as { enabled?: boolean } | undefined)?.enabled ||
      (entryFilterConfig.confluenceFilter as { enabled?: boolean } | undefined)?.enabled,
  );
  const riskProfileConfig = rawConfig.riskProfile as Partial<RiskProfile> | undefined;
  const riskManager = riskProfileConfig ? new RiskManagerService(null as any) : null;
  const extraTfCursors: Record<string, number> = {};
  for (const tf of Object.keys(extraTimeframeCandles)) extraTfCursors[tf] = 0;

  let peakEquity = initialQuote;
  let filteredSignals = 0;
  let currentDay = '';
  let dailyRealizedPnl = 0;

  if (strategy.init) await strategy.init(ctx);

  let quote = initialQuote;
  let baseHeld = 0;
  let openPosition: OpenPosition | null = null;
  const trades: SimulatedTrade[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    ctx.pushCandle(candle);
    ctx.setTicker({ symbol, price: candle.close, timestamp: candle.closeTime });

    const barDay = new Date(candle.closeTime).toISOString().slice(0, 10);
    if (barDay !== currentDay) {
      currentDay = barDay;
      dailyRealizedPnl = 0;
    }
    for (const tf of Object.keys(extraTfCursors)) {
      const series = extraTimeframeCandles[tf];
      while (
        extraTfCursors[tf] < series.length &&
        series[extraTfCursors[tf]].closeTime <= candle.closeTime
      ) {
        extraTfCursors[tf] += 1;
      }
    }

    if (openPosition) {
      ctx.setPosition({
        symbol,
        exchange: exchange.id,
        side: openPosition.side === 'BUY' ? 'LONG' : 'SHORT',
        quantity: openPosition.quantity,
        entryPrice: openPosition.entryPrice,
        markPrice: candle.close,
        unrealizedPnl:
          openPosition.side === 'BUY'
            ? (candle.close - openPosition.entryPrice) * openPosition.quantity
            : (openPosition.entryPrice - candle.close) * openPosition.quantity,
        realizedPnl: 0,
        market: 'SPOT',
        openedAt: openPosition.entryTime,
        updatedAt: candle.closeTime,
      });
    } else {
      ctx.setPosition(null);
    }

    if (i < warmupBars) continue;

    const signal = await strategy.onCandle(candle, ctx);
    if (!signal || signal.action === 'HOLD') continue;

    if (signal.action === 'OPEN' && !openPosition && signal.side) {
      const price = fillPriceForMarket(candle.close, signal.side, fees);
      let adjustedSignal: Signal = signal;

      if (hasEntryFilters) {
        const primaryHistory = candles.slice(0, i + 1);
        const extraHistory: Record<string, Candle[]> = {};
        for (const tf of Object.keys(extraTfCursors)) {
          extraHistory[tf] = extraTimeframeCandles[tf].slice(0, extraTfCursors[tf]);
        }
        const filterResult = applyEntryFilters({
          symbol,
          timeframe,
          side: signal.side,
          referencePrice: price,
          primaryHistory,
          extraTimeframeHistory: extraHistory,
          config: entryFilterConfig,
        });
        if (!filterResult.allowed) {
          filteredSignals += 1;
          continue;
        }
      }

      if (riskManager) {
        const equity = quote + baseHeld * candle.close;
        peakEquity = Math.max(peakEquity, equity);
        const currentDrawdownPct =
          peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
        const context = buildRiskContext({
          accountEquity: equity,
          freeMargin: quote,
          dailyPnl: dailyRealizedPnl,
          currentDrawdownPct,
          openPositionsCount: openPosition ? 1 : 0,
          maxDrawdownPct: riskProfileConfig?.maxDrawdownPct ?? 100,
          maxDailyLossPct: riskProfileConfig?.maxDailyLossPct ?? 100,
          maxPositionSizePct: riskProfileConfig?.maxPositionSizePct ?? 100,
          maxOpenPositions: riskProfileConfig?.maxOpenPositions ?? 100,
          // El backtest no simula el kill-switch/watchdog global (eso
          // reacciona a pérdidas reales en vivo, no tiene sentido
          // "replayearlo" sin ese estado) -- solo los chequeos por-señal
          // basados en el RiskProfile (drawdown, daily loss, sizing, cap).
          killSwitchEnabled: false,
        });
        const riskResult = await riskManager.check({
          signal,
          context,
          history: candles.slice(0, i + 1),
          profile: (riskProfileConfig as RiskProfile) ?? null,
        });
        if (!riskResult.decision.allowed) {
          filteredSignals += 1;
          continue;
        }
        adjustedSignal = riskResult.adjustedSignal ?? signal;
      }

      const notional =
        adjustedSignal.quoteQuantity ??
        (adjustedSignal.quantity ? adjustedSignal.quantity * price : 0);
      if (notional <= 0 || notional > quote) continue;
      const feeAmt = applyFee(notional, fees.takerBps);
      const usable = notional - feeAmt;
      const quantity = usable / price;
      if (quantity <= 0) continue;
      quote -= notional;
      baseHeld += quantity;
      openPosition = {
        side: signal.side,
        entryTime: candle.closeTime,
        entryPrice: price,
        quantity,
        entryBar: i,
        entryFees: feeAmt,
      };
      continue;
    }

    if (signal.action === 'CLOSE' && openPosition) {
      const exitSide = openPosition.side === 'BUY' ? 'SELL' : 'BUY';
      const exitPrice = fillPriceForMarket(candle.close, exitSide, fees);
      const grossExit = exitPrice * openPosition.quantity;
      const exitFee = applyFee(grossExit, fees.takerBps);
      quote += grossExit - exitFee;
      baseHeld -= openPosition.quantity;
      const pnl =
        (openPosition.side === 'BUY'
          ? exitPrice - openPosition.entryPrice
          : openPosition.entryPrice - exitPrice) *
          openPosition.quantity -
        openPosition.entryFees -
        exitFee;
      const pnlPct =
        (pnl / (openPosition.entryPrice * openPosition.quantity)) * 100;
      trades.push({
        side: openPosition.side,
        entryTime: openPosition.entryTime,
        exitTime: candle.closeTime,
        entryPrice: openPosition.entryPrice,
        exitPrice,
        quantity: openPosition.quantity,
        pnl,
        pnlPct,
        fees: openPosition.entryFees + exitFee,
        reason: signal.reason,
        bars: i - openPosition.entryBar,
      });
      dailyRealizedPnl += pnl;
      openPosition = null;
    }
  }

  if (openPosition) {
    const last = candles[candles.length - 1];
    const exitSide = openPosition.side === 'BUY' ? 'SELL' : 'BUY';
    const exitPrice = fillPriceForMarket(last.close, exitSide, fees);
    const grossExit = exitPrice * openPosition.quantity;
    const exitFee = applyFee(grossExit, fees.takerBps);
    quote += grossExit - exitFee;
    baseHeld -= openPosition.quantity;
    const pnl =
      (openPosition.side === 'BUY'
        ? exitPrice - openPosition.entryPrice
        : openPosition.entryPrice - exitPrice) *
        openPosition.quantity -
      openPosition.entryFees -
      exitFee;
    const pnlPct =
      (pnl / (openPosition.entryPrice * openPosition.quantity)) * 100;
    trades.push({
      side: openPosition.side,
      entryTime: openPosition.entryTime,
      exitTime: last.closeTime,
      entryPrice: openPosition.entryPrice,
      exitPrice,
      quantity: openPosition.quantity,
      pnl,
      pnlPct,
      fees: openPosition.entryFees + exitFee,
      reason: 'end-of-data',
      bars: candles.length - 1 - openPosition.entryBar,
    });
  }

  if (strategy.shutdown) await strategy.shutdown(ctx);

  const equityCurve = buildEquityCurve(initialQuote, trades);
  const startTime = candles[0].openTime;
  const endTime = candles[candles.length - 1].closeTime;
  const metrics = computeMetrics(
    trades,
    equityCurve,
    initialQuote,
    startTime,
    endTime,
  );

  return { trades, equityCurve, metrics, filteredSignals };
}
