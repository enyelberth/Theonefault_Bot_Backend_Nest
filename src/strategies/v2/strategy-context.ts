import type { Candle, Position, AccountBalance, Ticker, RiskContext, Timeframe } from '../../exchanges/domain';
import type { IExchange } from '../../exchanges/exchange.interface';

export interface StrategyContext<TConfig = Record<string, unknown>> {
  readonly strategyId: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly config: TConfig;
  readonly exchange: IExchange;

  history(): ReadonlyArray<Candle>;
  position(): Position | null;
  balance(): AccountBalance | null;
  ticker(): Ticker | null;
  risk(): RiskContext | null;

  now(): number;
  log(message: string, meta?: Record<string, unknown>): void;
  state<T = unknown>(key: string): T | undefined;
  setState<T = unknown>(key: string, value: T): void;
}
