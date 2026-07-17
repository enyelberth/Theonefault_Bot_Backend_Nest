import type { Candle, Signal, Timeframe } from '../../exchanges/domain';
import type { IStrategy } from '../../strategies/v2/strategy.interface';
import { InMemoryStrategyContext } from '../../strategies/v2/in-memory-context';
import type { IExchange } from '../../exchanges/exchange.interface';
import { buildEquityCurve, computeMetrics } from '../metrics/calculator';
import type { BacktestMetrics, EquityPoint, SimulatedTrade } from '../metrics/types';
import { DEFAULT_FEES, FeesConfig, applyFee, fillPriceForMarket } from './fees';

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
}

export interface SimulatorResult {
  trades: SimulatedTrade[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}

interface OpenPosition {
  side: 'BUY' | 'SELL';
  entryTime: number;
  entryPrice: number;
  quantity: number;
  entryBar: number;
  entryFees: number;
}

export async function runBacktest<TConfig>(input: SimulatorInput<TConfig>): Promise<SimulatorResult> {
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
  } = input;

  if (candles.length === 0) {
    const metrics = computeMetrics([], [], initialQuote, 0, 0);
    return { trades: [], equityCurve: [], metrics };
  }

  const ctx = new InMemoryStrategyContext<TConfig>({
    strategyId,
    symbol,
    timeframe,
    config,
    exchange,
    historyLimit: 1000,
  });

  if (strategy.init) await strategy.init(ctx);

  let quote = initialQuote;
  let baseHeld = 0;
  let openPosition: OpenPosition | null = null;
  const trades: SimulatedTrade[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    ctx.pushCandle(candle);
    ctx.setTicker({ symbol, price: candle.close, timestamp: candle.closeTime });

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
      const notional = signal.quoteQuantity ?? (signal.quantity ? signal.quantity * price : 0);
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
      const pnlPct = (pnl / (openPosition.entryPrice * openPosition.quantity)) * 100;
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
    const pnlPct = (pnl / (openPosition.entryPrice * openPosition.quantity)) * 100;
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
  const metrics = computeMetrics(trades, equityCurve, initialQuote, startTime, endTime);

  return { trades, equityCurve, metrics };
}
