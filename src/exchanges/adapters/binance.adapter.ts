import { Injectable, Logger } from '@nestjs/common';
import { BinanceService } from '../../binance/binance.service';
import type {
  AccountBalance,
  AssetBalance,
  Candle,
  MarketType,
  Order,
  OrderBook,
  OrderStatus,
  PlaceOrderParams,
  Position,
  SymbolInfo,
  Ticker,
  Timeframe,
  Trade,
} from '../domain';
import {
  ExchangeCapabilities,
  CandleQuery,
  IExchange,
  Unsubscribe,
} from '../exchange.interface';
import {
  NotImplementedByExchangeError,
  OrderRejectedError,
  SymbolNotFoundError,
} from '../exchange.errors';

const CAPABILITIES: ExchangeCapabilities = {
  spot: true,
  marginCross: true,
  marginIsolated: true,
  futures: false,
  oco: true,
  stopLoss: true,
  takeProfit: true,
  websocketStreams: false,
  paperTrading: false,
};

@Injectable()
export class BinanceAdapter implements IExchange {
  readonly id = 'binance' as const;
  readonly name = 'Binance';
  readonly capabilities = CAPABILITIES;

  private readonly logger = new Logger(BinanceAdapter.name);

  constructor(private readonly binance: BinanceService) {}

  async getServerTime(): Promise<number> {
    return this.binance.getServerTime();
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const { priceFilter, lotSizeFilter } = await this.binance.obtenerFiltrosSimbolo(symbol);
    if (!priceFilter || !lotSizeFilter) {
      throw new SymbolNotFoundError(this.id, symbol);
    }
    const decimals = await this.binance.getDecimalsForSymbol(symbol);
    return {
      symbol,
      baseAsset: '',
      quoteAsset: '',
      status: 'TRADING',
      priceDecimals: decimals.priceDecimals,
      quantityDecimals: decimals.quantityDecimals,
      tickSize: parseFloat(priceFilter.tickSize),
      stepSize: parseFloat(lotSizeFilter.stepSize),
      minNotional: 0,
      minQuantity: parseFloat(lotSizeFilter.minQty ?? '0'),
      maxQuantity: lotSizeFilter.maxQty ? parseFloat(lotSizeFilter.maxQty) : undefined,
    };
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const data = await this.binance.getSymbolPrice(symbol);
    return {
      symbol,
      price: parseFloat(data.price),
      timestamp: Date.now(),
    };
  }

  async getOrderBook(_symbol: string, _depth = 100): Promise<OrderBook> {
    throw new NotImplementedByExchangeError(this.id, 'getOrderBook');
  }

  async getCandles(query: CandleQuery): Promise<Candle[]> {
    const limit = query.limit ?? 500;
    const raw = await this.binance.getCandles(query.symbol, query.timeframe, limit);
    return raw.map((k) => ({
      symbol: query.symbol,
      timeframe: query.timeframe,
      openTime: k.openTime,
      closeTime: k.closeTime,
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume),
      closed: k.closeTime < Date.now(),
    }));
  }

  async getBalance(market: MarketType = 'SPOT'): Promise<AccountBalance> {
    if (market === 'SPOT') {
      const info = await this.binance.getAccountInfo();
      const balances: AssetBalance[] = (info.balances ?? [])
        .map((b: any) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
          total: parseFloat(b.free) + parseFloat(b.locked),
        }))
        .filter((b: AssetBalance) => b.total > 0);
      return { exchange: this.id, market, balances, timestamp: Date.now() };
    }
    if (market === 'MARGIN_CROSS') {
      const info = await this.binance.getCrossMarginAccountInfo();
      const balances: AssetBalance[] = (info.userAssets ?? []).map((a: any) => ({
        asset: a.asset,
        free: parseFloat(a.free),
        locked: parseFloat(a.locked),
        borrowed: parseFloat(a.borrowed),
        interest: parseFloat(a.interest),
        netAsset: parseFloat(a.netAsset),
        total: parseFloat(a.netAsset),
      }));
      return {
        exchange: this.id,
        market,
        balances,
        marginLevel: parseFloat(info.marginLevel),
        timestamp: Date.now(),
      };
    }
    throw new NotImplementedByExchangeError(this.id, `getBalance(${market})`);
  }

  async getPositions(market: MarketType = 'MARGIN_CROSS'): Promise<Position[]> {
    if (market !== 'MARGIN_CROSS') {
      throw new NotImplementedByExchangeError(this.id, `getPositions(${market})`);
    }
    const raw = await this.binance.getCrossMarginPositions();
    return raw.map((p: any) => this.mapPosition(p, market));
  }

  async getPosition(symbol: string, market: MarketType = 'MARGIN_CROSS'): Promise<Position | null> {
    try {
      const raw = await this.binance.getCrossMarginPosition(symbol);
      return this.mapPosition(raw, market);
    } catch {
      return null;
    }
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    const market = params.market ?? 'SPOT';
    const qty = params.quantity?.toString() ?? '0';
    const price = params.price?.toString() ?? '0';
    const tif = params.timeInForce ?? 'GTC';

    try {
      let raw: any;
      if (market === 'SPOT') {
        if (params.type === 'MARKET') {
          raw = await this.binance.createMarketOrder(params.symbol, params.side, qty);
        } else if (params.type === 'LIMIT') {
          raw = await this.binance.createLimitOrder(params.symbol, params.side, qty, price, tif);
        } else if (params.type === 'STOP_LOSS_LIMIT' && params.stopPrice) {
          raw = await this.binance.createStopLossOrder(
            params.symbol,
            params.side,
            qty,
            params.stopPrice.toString(),
          );
        } else {
          throw new NotImplementedByExchangeError(this.id, `placeOrder ${params.type} SPOT`);
        }
      } else if (market === 'MARGIN_CROSS') {
        if (params.type === 'MARKET') {
          raw = await this.binance.createCrossMarginMarketOrder(params.symbol, params.side, qty);
        } else if (params.type === 'LIMIT') {
          raw = await this.binance.createCrossMarginLimitOrder(
            params.symbol,
            params.side,
            qty,
            price,
            tif,
          );
        } else if (params.type === 'STOP_LOSS_LIMIT' && params.stopPrice) {
          raw = await this.binance.createCrossMarginStopLossOrder(
            params.symbol,
            params.side,
            qty,
            params.stopPrice.toString(),
          );
        } else {
          throw new NotImplementedByExchangeError(this.id, `placeOrder ${params.type} MARGIN_CROSS`);
        }
      } else if (market === 'MARGIN_ISOLATED') {
        if (params.type === 'MARKET') {
          raw = await this.binance.createIsolatedMarginMarketOrder(params.symbol, params.side, qty);
        } else if (params.type === 'LIMIT') {
          raw = await this.binance.createIsolatedMarginLimitOrder(
            params.symbol,
            params.side,
            qty,
            price,
            tif,
          );
        } else {
          throw new NotImplementedByExchangeError(
            this.id,
            `placeOrder ${params.type} MARGIN_ISOLATED`,
          );
        }
      } else {
        throw new NotImplementedByExchangeError(this.id, `placeOrder market=${market}`);
      }
      return this.mapOrder(raw, params.symbol, market);
    } catch (err: any) {
      if (err instanceof NotImplementedByExchangeError) throw err;
      const msg = err?.response?.data?.msg ?? err?.message ?? 'unknown';
      throw new OrderRejectedError(this.id, msg, err);
    }
  }

  async cancelOrder(symbol: string, orderId: string, market: MarketType = 'SPOT'): Promise<Order> {
    const numericId = Number(orderId);
    const raw =
      market === 'MARGIN_CROSS'
        ? await this.binance.cancelCrossMarginOrder(symbol, numericId)
        : await this.binance.cancelOrder(symbol, numericId);
    return this.mapOrder(raw, symbol, market);
  }

  async cancelAllOrders(symbol: string, market: MarketType = 'SPOT'): Promise<number> {
    if (market === 'MARGIN_CROSS') {
      const result = await this.binance.cancelAllCrossMarginOrders(symbol);
      return result.canceledOrdersCount ?? 0;
    }
    const result = await this.binance.cancelAllOrders(symbol);
    return result.canceledOrdersCount ?? 0;
  }

  async getOrder(symbol: string, orderId: string, market: MarketType = 'SPOT'): Promise<Order> {
    const numericId = Number(orderId);
    const raw =
      market === 'MARGIN_CROSS'
        ? await this.binance.checkCrossMarginOrderStatus(symbol, numericId)
        : await this.binance.checkOrderStatus(symbol, numericId);
    return this.mapOrder(raw, symbol, market);
  }

  async getOpenOrders(symbol?: string, market: MarketType = 'SPOT'): Promise<Order[]> {
    if (!symbol) throw new NotImplementedByExchangeError(this.id, 'getOpenOrders without symbol');
    if (market === 'MARGIN_CROSS') {
      const raw = await this.binance.getAllCrossMarginOrders(symbol);
      return raw.map((o: any) => this.mapOrder(o, symbol, market));
    }
    const raw = await this.binance.getAllOrders(symbol);
    return raw
      .filter((o: any) => o.status === 'NEW' || o.status === 'PARTIALLY_FILLED')
      .map((o: any) => this.mapOrder(o, symbol, market));
  }

  async getTrades(_symbol: string, _limit = 500, _market: MarketType = 'SPOT'): Promise<Trade[]> {
    throw new NotImplementedByExchangeError(this.id, 'getTrades');
  }

  subscribeTicker?(_symbol: string, _handler: (t: Ticker) => void): Promise<Unsubscribe> {
    throw new NotImplementedByExchangeError(this.id, 'subscribeTicker');
  }

  subscribeCandles?(
    _symbol: string,
    _timeframe: Timeframe,
    _handler: (c: Candle) => void,
  ): Promise<Unsubscribe> {
    throw new NotImplementedByExchangeError(this.id, 'subscribeCandles');
  }

  private mapOrder(raw: any, symbol: string, market: MarketType): Order {
    const price = parseFloat(raw?.price ?? '0');
    const qty = parseFloat(raw?.origQty ?? raw?.quantity ?? '0');
    const filled = parseFloat(raw?.executedQty ?? '0');
    const cumQuote = parseFloat(raw?.cummulativeQuoteQty ?? '0');
    return {
      id: String(raw?.orderId ?? raw?.id ?? ''),
      clientOrderId: raw?.clientOrderId,
      exchange: this.id,
      symbol,
      side: (raw?.side ?? 'BUY') as any,
      type: (raw?.type ?? 'LIMIT') as any,
      status: (raw?.status ?? 'NEW') as OrderStatus,
      price,
      stopPrice: raw?.stopPrice ? parseFloat(raw.stopPrice) : undefined,
      quantity: qty,
      filledQuantity: filled,
      averagePrice: filled > 0 ? cumQuote / filled : 0,
      quoteQuantity: cumQuote,
      createdAt: raw?.time ?? Date.now(),
      updatedAt: raw?.updateTime ?? Date.now(),
      market,
      raw,
    };
  }

  private mapPosition(raw: any, market: MarketType): Position {
    const amt = parseFloat(raw?.positionAmt ?? '0');
    return {
      symbol: raw?.symbol,
      exchange: this.id,
      side: amt > 0 ? 'LONG' : amt < 0 ? 'SHORT' : 'FLAT',
      quantity: Math.abs(amt),
      entryPrice: parseFloat(raw?.entryPrice ?? '0'),
      markPrice: parseFloat(raw?.markPrice ?? '0'),
      liquidationPrice: raw?.liquidationPrice ? parseFloat(raw.liquidationPrice) : undefined,
      unrealizedPnl: parseFloat(raw?.unRealizedProfit ?? '0'),
      realizedPnl: 0,
      leverage: raw?.leverage ? parseFloat(raw.leverage) : undefined,
      market,
      openedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}
