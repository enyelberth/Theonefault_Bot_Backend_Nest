export interface TradingStrategy<TConfig = unknown> {
  symbol: string;
  config: TConfig;
  id: string;

  run(): Promise<void>;
  stop(): Promise<void>;
}

export interface MutableOrderLevelsStrategy {
  addOrderLevel(orderLevel: {
    id: number;
    price: number;
    quantity: number;
  }): void | Promise<void>;
  removeOrderLevel(levelIndex: number): void | Promise<void>;
  updateOrderLevelPrice(
    levelIndex: number,
    newPrice: number,
  ): void | Promise<void>;
}

export interface ProfitMarginUpdatableStrategy {
  updateProfitMargin(newProfitMargin: number): void | Promise<void>;
}

export function isMutableOrderLevelsStrategy(
  strategy: TradingStrategy,
): strategy is TradingStrategy & MutableOrderLevelsStrategy {
  const candidate = strategy as unknown as MutableOrderLevelsStrategy;
  return (
    typeof candidate.addOrderLevel === 'function' &&
    typeof candidate.removeOrderLevel === 'function' &&
    typeof candidate.updateOrderLevelPrice === 'function'
  );
}

export function isProfitMarginUpdatableStrategy(
  strategy: TradingStrategy,
): strategy is TradingStrategy & ProfitMarginUpdatableStrategy {
  const candidate = strategy as unknown as ProfitMarginUpdatableStrategy;
  return typeof candidate.updateProfitMargin === 'function';
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
  profitMargin?: number;
  stopLossMargin?: number;
  maxOrderAgeMs?: number;
  numBuyOrders?: number;
}

export interface EmaAdxTrendStrategyConfig {
  tradeQuantity: number;
  interval?: string;
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  adxPeriod?: number;
  adxThreshold?: number;
  atrPeriod?: number;
  stopLossAtrMultiplier?: number;
  takeProfitAtrMultiplier?: number;
  minSleepMs?: number;
}

export interface StochRsiScalperStrategyConfig {
  tradeQuantity: number;
  interval?: string;
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  stochRsiPeriod?: number;
  stochRsiKPeriod?: number;
  stochRsiDPeriod?: number;
  stochRsiLowerBand?: number;
  stochRsiUpperBand?: number;
  atrPeriod?: number;
  stopLossAtrMultiplier?: number;
  takeProfitAtrMultiplier?: number;
  volumeLookback?: number;
  volumeMultiplier?: number;
  maxTradeDurationCandles?: number;
  minSleepMs?: number;
}

export interface GridFullStrategyConfig {
  trading?: boolean;
  gridCount: number;
  lowerPrice: number;
  upperPrice: number;
  totalQuantity: number;
  profitMargin: number;

  maxOrderAgeMs?: number;
  stopLossMargin?: number;
  minSleepMs?: number;
  maxSleepMs?: number;
  buySafetyMargin?: number; // P
}
