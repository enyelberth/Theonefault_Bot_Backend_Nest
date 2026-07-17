import type { OrderSide, MarketType } from './order';

export type PositionSide = 'LONG' | 'SHORT' | 'FLAT';

export interface Position {
  symbol: string;
  exchange: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage?: number;
  margin?: number;
  market: MarketType;
  openedAt: number;
  updatedAt: number;
}

export interface PositionUpdate {
  symbol: string;
  fillSide: OrderSide;
  fillQuantity: number;
  fillPrice: number;
  fee: number;
  timestamp: number;
}
