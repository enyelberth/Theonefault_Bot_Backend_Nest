export interface TradingStrategy<TConfig = any> {
  symbol: string;
  config: TConfig;

  run(): Promise<void>;
  stop?(): Promise<void>;
}
export interface GridStrategyConfig {
  gridCount: number;
  lowerPrice?: number;
  upperPrice?: number;
  totalQuantity: number;
  profitMargin: number;
  maxOrderAgeMs?: number;
  stopLossMargin?: number;
  minSleepMs?: number;
  maxSleepMs?: number;
}

export interface RsiStrategyConfig {
  rsiPeriod: number;
  oversoldThreshold: number;
  overboughtThreshold: number;
  tradeQuantity: number;
  minSleepMs?: number;
}
