import type { Candle, Signal } from '../../../exchanges/domain';
import { holdSignal } from '../../../exchanges/domain';
import { smaSeries } from '../indicators';
import type { IStrategy, StrategyMetadata } from '../strategy.interface';
import type { StrategyContext } from '../strategy-context';

export interface SmaCrossConfig {
  fastPeriod: number;
  slowPeriod: number;
  quoteQuantity: number;
}

const META: StrategyMetadata = {
  id: 'sma-cross',
  name: 'SMA Crossover',
  version: '1.0.0',
  description: 'Enter LONG on fast SMA crossing above slow SMA, exit on inverse cross.',
  tags: ['trend', 'sample'],
  configSchema: {
    fastPeriod: { type: 'integer', minimum: 2, default: 9 },
    slowPeriod: { type: 'integer', minimum: 3, default: 21 },
    quoteQuantity: { type: 'number', minimum: 0, default: 10 },
  },
};

export class SmaCrossStrategy implements IStrategy<SmaCrossConfig> {
  readonly metadata = META;

  onCandle(candle: Candle, ctx: StrategyContext<SmaCrossConfig>): Signal {
    const { fastPeriod, slowPeriod, quoteQuantity } = ctx.config;
    const closes = ctx.history().map((c) => c.close);
    if (closes.length < slowPeriod + 2) return holdSignal(ctx.symbol, 'warmup');

    const fast = smaSeries(closes, fastPeriod);
    const slow = smaSeries(closes, slowPeriod);
    if (fast.length < 2 || slow.length < 2) return holdSignal(ctx.symbol, 'insufficient-data');

    const fPrev = fast[fast.length - 2];
    const fNow = fast[fast.length - 1];
    const sPrev = slow[slow.length - 2];
    const sNow = slow[slow.length - 1];

    const crossedUp = fPrev <= sPrev && fNow > sNow;
    const crossedDown = fPrev >= sPrev && fNow < sNow;
    const position = ctx.position();
    const isLong = position?.side === 'LONG' && position.quantity > 0;

    if (crossedUp && !isLong) {
      return {
        action: 'OPEN',
        symbol: ctx.symbol,
        side: 'BUY',
        type: 'MARKET',
        quoteQuantity,
        reason: `SMA${fastPeriod} crossed above SMA${slowPeriod}`,
        emittedAt: ctx.now(),
      };
    }
    if (crossedDown && isLong) {
      return {
        action: 'CLOSE',
        symbol: ctx.symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: position!.quantity,
        reason: `SMA${fastPeriod} crossed below SMA${slowPeriod}`,
        emittedAt: ctx.now(),
      };
    }
    return holdSignal(ctx.symbol, 'no-cross');
  }
}
