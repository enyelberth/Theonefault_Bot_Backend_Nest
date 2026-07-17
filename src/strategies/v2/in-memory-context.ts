import { Logger } from '@nestjs/common';
import type { AccountBalance, Candle, Position, RiskContext, Ticker, Timeframe } from '../../exchanges/domain';
import type { IExchange } from '../../exchanges/exchange.interface';
import type { StrategyContext } from './strategy-context';

export interface InMemoryContextInit<TConfig> {
  strategyId: string;
  symbol: string;
  timeframe: Timeframe;
  config: TConfig;
  exchange: IExchange;
  historyLimit?: number;
}

export class InMemoryStrategyContext<TConfig> implements StrategyContext<TConfig> {
  readonly strategyId: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly config: TConfig;
  readonly exchange: IExchange;

  private readonly logger: Logger;
  private readonly historyBuffer: Candle[] = [];
  private readonly historyLimit: number;
  private readonly stateMap = new Map<string, unknown>();

  private currentPosition: Position | null = null;
  private currentBalance: AccountBalance | null = null;
  private currentTicker: Ticker | null = null;
  private currentRisk: RiskContext | null = null;

  constructor(init: InMemoryContextInit<TConfig>) {
    this.strategyId = init.strategyId;
    this.symbol = init.symbol;
    this.timeframe = init.timeframe;
    this.config = init.config;
    this.exchange = init.exchange;
    this.historyLimit = init.historyLimit ?? 500;
    this.logger = new Logger(`Strategy:${init.strategyId}`);
  }

  pushCandle(candle: Candle): void {
    this.historyBuffer.push(candle);
    if (this.historyBuffer.length > this.historyLimit) {
      this.historyBuffer.splice(0, this.historyBuffer.length - this.historyLimit);
    }
  }

  seedHistory(candles: Candle[]): void {
    this.historyBuffer.splice(0, this.historyBuffer.length);
    const slice = candles.slice(-this.historyLimit);
    this.historyBuffer.push(...slice);
  }

  setPosition(position: Position | null): void {
    this.currentPosition = position;
  }

  setBalance(balance: AccountBalance | null): void {
    this.currentBalance = balance;
  }

  setTicker(ticker: Ticker | null): void {
    this.currentTicker = ticker;
  }

  setRisk(risk: RiskContext | null): void {
    this.currentRisk = risk;
  }

  history(): ReadonlyArray<Candle> {
    return this.historyBuffer;
  }

  position(): Position | null {
    return this.currentPosition;
  }

  balance(): AccountBalance | null {
    return this.currentBalance;
  }

  ticker(): Ticker | null {
    return this.currentTicker;
  }

  risk(): RiskContext | null {
    return this.currentRisk;
  }

  now(): number {
    return Date.now();
  }

  log(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      this.logger.log(`${message} ${JSON.stringify(meta)}`);
    } else {
      this.logger.log(message);
    }
  }

  state<T>(key: string): T | undefined {
    return this.stateMap.get(key) as T | undefined;
  }

  setState<T>(key: string, value: T): void {
    this.stateMap.set(key, value);
  }
}
