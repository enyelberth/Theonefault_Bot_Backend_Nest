import type { MarketType } from './order';

export interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  borrowed?: number;
  interest?: number;
  netAsset?: number;
  total: number;
}

export interface AccountBalance {
  exchange: string;
  market: MarketType;
  balances: AssetBalance[];
  totalValueUsd?: number;
  marginLevel?: number;
  timestamp: number;
}
