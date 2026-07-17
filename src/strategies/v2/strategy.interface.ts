import type { Candle, Signal } from '../../exchanges/domain';
import type { StrategyContext } from './strategy-context';

export interface StrategyMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  configSchema?: Record<string, unknown>;
}

export interface IStrategy<TConfig = Record<string, unknown>> {
  readonly metadata: StrategyMetadata;

  init?(ctx: StrategyContext<TConfig>): Promise<void> | void;

  onCandle(candle: Candle, ctx: StrategyContext<TConfig>): Promise<Signal> | Signal;

  onTick?(ctx: StrategyContext<TConfig>): Promise<Signal | null> | Signal | null;

  onOrderFilled?(ctx: StrategyContext<TConfig>): Promise<void> | void;

  shutdown?(ctx: StrategyContext<TConfig>): Promise<void> | void;
}
