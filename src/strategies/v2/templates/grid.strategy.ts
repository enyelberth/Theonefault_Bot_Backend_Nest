import type { Candle, Signal } from '../../../exchanges/domain';
import { holdSignal } from '../../../exchanges/domain';
import type { IStrategy, StrategyMetadata } from '../strategy.interface';
import type { StrategyContext } from '../strategy-context';

export interface GridStrategyConfig {
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  quotePerLevel: number;
  profitMargin: number;
  side?: 'BUY' | 'SELL' | 'BOTH';
}

interface GridState {
  levels: number[];
  filledLevels: Record<number, { entryPrice: number; quantity: number }>;
}

const META: StrategyMetadata = {
  id: 'grid',
  name: 'Grid Bot',
  version: '1.0.0',
  description: 'Buy at low grid levels, sell filled positions at profitMargin above entry.',
  tags: ['grid', 'template'],
  configSchema: {
    lowerPrice: { type: 'number', minimum: 0 },
    upperPrice: { type: 'number', minimum: 0 },
    gridCount: { type: 'integer', minimum: 2, maximum: 100, default: 10 },
    quotePerLevel: { type: 'number', minimum: 0, default: 20 },
    profitMargin: { type: 'number', minimum: 0, default: 0.005 },
    side: { type: 'string', enum: ['BUY', 'SELL', 'BOTH'], default: 'BUY' },
  },
};

export class GridStrategy implements IStrategy<GridStrategyConfig> {
  readonly metadata = META;

  init(ctx: StrategyContext<GridStrategyConfig>): void {
    const { lowerPrice, upperPrice, gridCount } = ctx.config;
    if (lowerPrice <= 0 || upperPrice <= lowerPrice || gridCount < 2) {
      throw new Error('grid: invalid price range or gridCount < 2');
    }
    const step = (upperPrice - lowerPrice) / (gridCount - 1);
    const levels = Array.from({ length: gridCount }, (_, i) =>
      Number((lowerPrice + i * step).toFixed(8)),
    );
    ctx.setState<GridState>('grid', { levels, filledLevels: {} });
  }

  onCandle(candle: Candle, ctx: StrategyContext<GridStrategyConfig>): Signal {
    const state = ctx.state<GridState>('grid');
    if (!state) return holdSignal(ctx.symbol, 'no-state');

    const { profitMargin, quotePerLevel, side = 'BUY' } = ctx.config;
    const price = candle.close;

    if (side === 'BUY' || side === 'BOTH') {
      const targetLevel = state.levels.find(
        (lvl, i) => !state.filledLevels[i] && price <= lvl,
      );
      if (targetLevel !== undefined) {
        const idx = state.levels.indexOf(targetLevel);
        const quantity = quotePerLevel / price;
        state.filledLevels[idx] = { entryPrice: price, quantity };
        ctx.setState('grid', state);
        return {
          action: 'OPEN',
          symbol: ctx.symbol,
          side: 'BUY',
          type: 'MARKET',
          quoteQuantity: quotePerLevel,
          reason: `grid buy level ${idx} @ ${targetLevel}`,
          metadata: { level: idx },
          emittedAt: ctx.now(),
        };
      }
    }

    for (const [idxStr, filled] of Object.entries(state.filledLevels)) {
      const target = filled.entryPrice * (1 + profitMargin);
      if (price >= target) {
        const idx = Number(idxStr);
        const qty = filled.quantity;
        delete state.filledLevels[idx];
        ctx.setState('grid', state);
        return {
          action: 'CLOSE',
          symbol: ctx.symbol,
          side: 'SELL',
          type: 'MARKET',
          quantity: qty,
          reason: `grid tp level ${idx} entry=${filled.entryPrice} target=${target.toFixed(4)}`,
          metadata: { level: idx },
          emittedAt: ctx.now(),
        };
      }
    }

    return holdSignal(ctx.symbol, 'no-trigger');
  }
}
