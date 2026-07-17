import type {
  AccountBalance,
  Candle,
  MarketType,
  Order,
  OrderBook,
  PlaceOrderParams,
  Position,
  SymbolInfo,
  Ticker,
  Timeframe,
  Trade,
} from './domain';

export type ExchangeId = 'binance' | 'binance-paper' | 'bybit' | 'okx' | 'kraken';

export interface ExchangeCapabilities {
  spot: boolean;
  marginCross: boolean;
  marginIsolated: boolean;
  futures: boolean;
  oco: boolean;
  stopLoss: boolean;
  takeProfit: boolean;
  websocketStreams: boolean;
  paperTrading: boolean;
}

export interface CandleQuery {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export type Unsubscribe = () => void;

export interface IExchange {
  readonly id: ExchangeId;
  readonly name: string;
  readonly capabilities: ExchangeCapabilities;

  getServerTime(): Promise<number>;
  getSymbolInfo(symbol: string): Promise<SymbolInfo>;
  getTicker(symbol: string): Promise<Ticker>;
  getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
  getCandles(query: CandleQuery): Promise<Candle[]>;

  getBalance(market?: MarketType): Promise<AccountBalance>;
  getPositions(market?: MarketType): Promise<Position[]>;
  getPosition(symbol: string, market?: MarketType): Promise<Position | null>;

  placeOrder(params: PlaceOrderParams): Promise<Order>;
  cancelOrder(symbol: string, orderId: string, market?: MarketType): Promise<Order>;
  cancelAllOrders(symbol: string, market?: MarketType): Promise<number>;
  getOrder(symbol: string, orderId: string, market?: MarketType): Promise<Order>;
  getOpenOrders(symbol?: string, market?: MarketType): Promise<Order[]>;
  getTrades(symbol: string, limit?: number, market?: MarketType): Promise<Trade[]>;

  subscribeTicker?(symbol: string, handler: (ticker: Ticker) => void): Promise<Unsubscribe>;
  subscribeCandles?(
    symbol: string,
    timeframe: Timeframe,
    handler: (candle: Candle) => void,
  ): Promise<Unsubscribe>;
}
