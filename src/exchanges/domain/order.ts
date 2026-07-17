export type OrderSide = 'BUY' | 'SELL';

export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_LOSS'
  | 'STOP_LOSS_LIMIT'
  | 'TAKE_PROFIT'
  | 'TAKE_PROFIT_LIMIT'
  | 'LIMIT_MAKER';

export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export type OrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'PENDING_CANCEL'
  | 'REJECTED'
  | 'EXPIRED';

export type MarketType = 'SPOT' | 'MARGIN_CROSS' | 'MARGIN_ISOLATED' | 'FUTURES';

export interface PlaceOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity?: number;
  quoteQuantity?: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
  market?: MarketType;
  clientOrderId?: string;
  reduceOnly?: boolean;
  postOnly?: boolean;
}

export interface Order {
  id: string;
  clientOrderId?: string;
  exchange: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  price: number;
  stopPrice?: number;
  quantity: number;
  filledQuantity: number;
  averagePrice: number;
  quoteQuantity: number;
  fee?: number;
  feeCurrency?: string;
  createdAt: number;
  updatedAt: number;
  market: MarketType;
  raw?: unknown;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  quoteQuantity: number;
  fee: number;
  feeCurrency: string;
  timestamp: number;
  isMaker: boolean;
}
