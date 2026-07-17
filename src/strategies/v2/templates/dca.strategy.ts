import type { Candle, Signal } from '../../../exchanges/domain';
import { holdSignal } from '../../../exchanges/domain';
import type { IStrategy, StrategyMetadata } from '../strategy.interface';
import type { StrategyContext } from '../strategy-context';

export interface DcaStrategyConfig {
  intervalBars: number;
  quotePerBuy: number;
  takeProfit?: number;
  stopLoss?: number;
  maxPositions?: number;
}

interface DcaState {
  bars: number;
  totalCost: number;
  totalQty: number;
  buys: number;
}

const META: StrategyMetadata = {
  id: 'dca',
  name: 'DCA Bot',
  version: '1.0.0',
  description: 'Recurring buys every N bars. Optional TP/SL vs average entry.',
  tags: ['dca', 'template'],
  configSchema: {
    intervalBars: { type: 'integer', minimum: 1, default: 24 },
    quotePerBuy: { type: 'number', minimum: 0, default: 50 },
    takeProfit: { type: 'number', minimum: 0, default: 0.1 },
    stopLoss: { type: 'number', minimum: 0, default: 0.3 },
    maxPositions: { type: 'integer', minimum: 1, default: 100 },
  },
};

export class DcaStrategy implements IStrategy<DcaStrategyConfig> {
  readonly metadata = META;

  init(ctx: StrategyContext<DcaStrategyConfig>): void {
    ctx.setState<DcaState>('dca', { bars: 0, totalCost: 0, totalQty: 0, buys: 0 });
  }

  onCandle(candle: Candle, ctx: StrategyContext<DcaStrategyConfig>): Signal {
    const state = ctx.state<DcaState>('dca') ?? { bars: 0, totalCost: 0, totalQty: 0, buys: 0 };
    const {
      intervalBars,
      quotePerBuy,
      takeProfit,
      stopLoss,
      maxPositions = Infinity,
    } = ctx.config;
    state.bars += 1;

    if (state.totalQty > 0) {
      const avg = state.totalCost / state.totalQty;
      const change = (candle.close - avg) / avg;
      if (takeProfit && change >= takeProfit) {
        const qty = state.totalQty;
        state.totalCost = 0;
        state.totalQty = 0;
        state.buys = 0;
        state.bars = 0;
        ctx.setState('dca', state);
        return {
          action: 'CLOSE',
          symbol: ctx.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: qty,
          reason: `dca tp ${(change * 100).toFixed(2)}%`,
          emittedAt: ctx.now(),
        };
      }
      if (stopLoss && change <= -stopLoss) {
        const qty = state.totalQty;
        state.totalCost = 0;
        state.totalQty = 0;
        state.buys = 0;
        state.bars = 0;
        ctx.setState('dca', state);
        return {
          action: 'CLOSE',
          symbol: ctx.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: qty,
          reason: `dca sl ${(change * 100).toFixed(2)}%`,
          emittedAt: ctx.now(),
        };
      }
    }

    if (state.bars < intervalBars || state.buys >= maxPositions) {
      ctx.setState('dca', state);
      return holdSignal(ctx.symbol, 'waiting-interval');
    }

    const qty = quotePerBuy / candle.close;
    state.totalCost += quotePerBuy;
    state.totalQty += qty;
    state.buys += 1;
    state.bars = 0;
    ctx.setState('dca', state);

    return {
      action: 'OPEN',
      symbol: ctx.symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteQuantity: quotePerBuy,
      reason: `dca buy #${state.buys}`,
      emittedAt: ctx.now(),
    };
  }
}
