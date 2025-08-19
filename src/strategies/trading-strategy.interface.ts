// strategies/trading-strategy.interface.ts
export interface TradingStrategy {
  symbol: string;
  config: any;

  run(): Promise<void>;
  stop?(): Promise<void>;
}
