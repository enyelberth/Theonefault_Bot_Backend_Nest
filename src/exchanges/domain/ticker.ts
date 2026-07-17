export interface Ticker {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  priceDecimals: number;
  quantityDecimals: number;
  tickSize: number;
  stepSize: number;
  minNotional: number;
  minQuantity: number;
  maxQuantity?: number;
}
