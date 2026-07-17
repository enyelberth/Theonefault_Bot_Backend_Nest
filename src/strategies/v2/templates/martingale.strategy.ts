import type { Candle, Signal } from '../../../exchanges/domain';
import { holdSignal } from '../../../exchanges/domain';
import type { IStrategy, StrategyMetadata } from '../strategy.interface';
import type { StrategyContext } from '../strategy-context';

export interface MartingaleStrategyConfig {
  baseQuote: number;
  multiplier: number;
  maxSteps: number;
  takeProfit: number;
  stopLoss: number;
}

interface MartingaleState {
  step: number;
  positionQty: number;
  positionCost: number;
  active: boolean;
}

const META: StrategyMetadata = {
  id: 'martingale',
  name: 'Martingale',
  version: '1.0.0',
  description: 'Double position size after loss up to maxSteps. WARNING high risk of capital blowup.',
  tags: ['martingale', 'high-risk', 'template'],
  configSchema: {
    baseQuote: { type: 'number', minimum: 0, default: 20 },
    multiplier: { type: 'number', minimum: 1, default: 2 },
    maxSteps: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    takeProfit: { type: 'number', minimum: 0, default: 0.02 },
    stopLoss: { type: 'number', minimum: 0, default: 0.02 },
  },
};

export class MartingaleStrategy implements IStrategy<MartingaleStrategyConfig> {
  readonly metadata = META;

  init(ctx: StrategyContext<MartingaleStrategyConfig>): void {
    ctx.setState<MartingaleState>('mg', { step: 0, positionQty: 0, positionCost: 0, active: false });
  }

  onCandle(candle: Candle, ctx: StrategyContext<MartingaleStrategyConfig>): Signal {
    const state = ctx.state<MartingaleState>('mg') ?? {
      step: 0,
      positionQty: 0,
      positionCost: 0,
      active: false,
    };
    const { baseQuote, multiplier, maxSteps, takeProfit, stopLoss } = ctx.config;
    const price = candle.close;

    if (state.active && state.positionQty > 0) {
      const avg = state.positionCost / state.positionQty;
      const change = (price - avg) / avg;

      if (change >= takeProfit) {
        const qty = state.positionQty;
        state.step = 0;
        state.positionCost = 0;
        state.positionQty = 0;
        state.active = false;
        ctx.setState('mg', state);
        return {
          action: 'CLOSE',
          symbol: ctx.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: qty,
          reason: `martingale tp ${(change * 100).toFixed(2)}%`,
          emittedAt: ctx.now(),
        };
      }

      if (change <= -stopLoss) {
        if (state.step >= maxSteps) {
          const qty = state.positionQty;
          state.step = 0;
          state.positionCost = 0;
          state.positionQty = 0;
          state.active = false;
          ctx.setState('mg', state);
          return {
            action: 'CLOSE',
            symbol: ctx.symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity: qty,
            reason: `martingale max-steps blowup`,
            emittedAt: ctx.now(),
          };
        }
        state.step += 1;
        const quoteThisStep = baseQuote * Math.pow(multiplier, state.step);
        const qty = quoteThisStep / price;
        state.positionCost += quoteThisStep;
        state.positionQty += qty;
        ctx.setState('mg', state);
        return {
          action: 'ADJUST',
          symbol: ctx.symbol,
          side: 'BUY',
          type: 'MARKET',
          quoteQuantity: quoteThisStep,
          reason: `martingale step ${state.step} multiplier=${multiplier}`,
          metadata: { step: state.step },
          emittedAt: ctx.now(),
        };
      }

      return holdSignal(ctx.symbol, 'holding-position');
    }

    state.step = 0;
    state.active = true;
    const qty = baseQuote / price;
    state.positionCost = baseQuote;
    state.positionQty = qty;
    ctx.setState('mg', state);
    return {
      action: 'OPEN',
      symbol: ctx.symbol,
      side: 'BUY',
      type: 'MARKET',
      quoteQuantity: baseQuote,
      reason: 'martingale base entry',
      metadata: { step: 0 },
      emittedAt: ctx.now(),
    };
  }
}
