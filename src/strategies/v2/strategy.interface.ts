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

  onCandle(
    candle: Candle,
    ctx: StrategyContext<TConfig>,
  ): Promise<Signal> | Signal;

  onTick?(
    ctx: StrategyContext<TConfig>,
  ): Promise<Signal | null> | Signal | null;

  onOrderFilled?(ctx: StrategyContext<TConfig>): Promise<void> | void;

  /**
   * La orden del `signal` emitido nunca llenó nada (rechazada, cancelada
   * sin fill, o el placeOrder mismo falló). Sin este hook, una estrategia
   * que marca su estado interno como "ocupado" al EMITIR la señal (antes
   * de saber si la orden de verdad se va a ejecutar) deja ese slot
   * huérfano para siempre si la orden falla — ninguna señal futura lo
   * vuelve a considerar y el capital que debía usar ahí queda atascado.
   */
  onOrderFailed?(
    ctx: StrategyContext<TConfig>,
    signal: Signal,
  ): Promise<void> | void;

  shutdown?(ctx: StrategyContext<TConfig>): Promise<void> | void;
}
