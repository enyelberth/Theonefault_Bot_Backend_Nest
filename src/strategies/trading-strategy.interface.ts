import type { PrismaClient } from '@prisma/client';
import type { StrategyPnlReporter } from 'src/bot/strategy-pnl-reporter';

export interface TradingStrategy<TConfig = any> {
  symbol: string;
  config: TConfig;
  id: string;

  run(): Promise<void>;
  stop?(): Promise<void>;

  /** Opcional: strategy que quiera reportar PnL implementa este método. */
  attachPnlReporter?(reporter: StrategyPnlReporter): void;

  /** Opcional: strategies con estado persistido usan este método para hidratar desde DB al restart/rehydrate. */
  setBotRunContext?(botRunId: number, prisma: PrismaClient): void;
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
