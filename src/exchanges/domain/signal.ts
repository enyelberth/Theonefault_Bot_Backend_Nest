import type { OrderSide, OrderType, TimeInForce, MarketType } from './order';

export type SignalAction = 'OPEN' | 'CLOSE' | 'ADJUST' | 'HOLD' | 'CANCEL_ALL';

export interface Signal {
  action: SignalAction;
  symbol: string;
  side?: OrderSide;
  type?: OrderType;
  quantity?: number;
  quoteQuantity?: number;
  price?: number;
  stopPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  timeInForce?: TimeInForce;
  market?: MarketType;
  reason?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  emittedAt: number;
}

export function holdSignal(symbol: string, reason?: string): Signal {
  return { action: 'HOLD', symbol, reason, emittedAt: Date.now() };
}
