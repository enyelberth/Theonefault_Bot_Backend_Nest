import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
  InsufficientBalanceError,
  NotImplementedByExchangeError,
  OrderRejectedError,
} from '../exchange.errors';
import { applyFee, fillPriceForMarket, FeesConfig } from '../../backtesting/engine/fees';
import { BinanceAdapter } from '../adapters/binance.adapter';
import { PaperAccountService } from './paper-account.service';
import { PaperBalances, ensureBalance, totalOf } from './paper-types';

const CAPABILITIES: ExchangeCapabilities = {
  spot: true,
  marginCross: false,
  marginIsolated: false,
  futures: false,
  oco: false,
  stopLoss: true,
  takeProfit: true,
  websocketStreams: false,
  paperTrading: true,
};

interface OpenPaperOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'STOP_LOSS_LIMIT';
  price?: number;
  stopPrice?: number;
  quantity: number;
  createdAt: number;
}

export class PaperExchangeAdapter implements IExchange {
  readonly id = 'binance-paper' as const;
  readonly name: string;
  readonly capabilities = CAPABILITIES;

  private readonly logger: Logger;
  private readonly openOrders = new Map<string, OpenPaperOrder>();

  constructor(
    private readonly accountId: number,
    private readonly reference: BinanceAdapter,
    private readonly accounts: PaperAccountService,
  ) {
    this.name = `Paper Binance (#${accountId})`;
    this.logger = new Logger(`PaperExchange:${accountId}`);
  }

  async getServerTime(): Promise<number> {
    return Date.now();
  }

  getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    return this.reference.getSymbolInfo(symbol);
  }

  getTicker(symbol: string): Promise<Ticker> {
    return this.reference.getTicker(symbol);
  }

  getOrderBook(symbol: string, depth?: number): Promise<OrderBook> {
    return this.reference.getOrderBook(symbol, depth);
  }

  getCandles(query: CandleQuery): Promise<Candle[]> {
    return this.reference.getCandles(query);
  }

  async getBalance(market: MarketType = 'SPOT'): Promise<AccountBalance> {
    if (market !== 'SPOT') {
      throw new NotImplementedByExchangeError(this.id, `getBalance(${market})`);
    }
    const account = await this.accounts.get(this.accountId);
    const balances = this.accounts.readBalances(account);
    const list: AssetBalance[] = Object.entries(balances).map(([asset, b]) => ({
      asset,
      free: b.free,
      locked: b.locked,
      total: totalOf(b),
    }));
    return {
      exchange: this.id,
      market,
      balances: list,
      timestamp: Date.now(),
    };
  }

  async getPositions(): Promise<Position[]> {
    const account = await this.accounts.get(this.accountId);
    const balances = this.accounts.readBalances(account);
    const quote = account.quoteAsset;
    return Object.entries(balances)
      .filter(([asset, b]) => asset !== quote && totalOf(b) > 0)
      .map(([asset, b]) => this.balanceToPosition(asset, quote, b));
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const account = await this.accounts.get(this.accountId);
    const balances = this.accounts.readBalances(account);
    const base = symbol.replace(account.quoteAsset, '');
    const b = balances[base];
    if (!b || totalOf(b) <= 0) return null;
    return this.balanceToPosition(base, account.quoteAsset, b);
  }

  async placeOrder(params: PlaceOrderParams): Promise<Order> {
    if ((params.market ?? 'SPOT') !== 'SPOT') {
      throw new NotImplementedByExchangeError(this.id, `placeOrder market=${params.market}`);
    }
    const account = await this.accounts.get(this.accountId);
    const fees = this.accounts.readFees(account);
    const base = params.symbol.replace(account.quoteAsset, '');
    const balances = this.accounts.readBalances(account);
    const ticker = await this.getTicker(params.symbol);

    const orderId = randomUUID();

    if (params.type === 'MARKET') {
      const fillPrice = fillPriceForMarket(ticker.price, params.side, fees);
      const quantity = this.resolveQuantity(params, fillPrice);
      if (quantity <= 0) {
        throw new OrderRejectedError(this.id, 'invalid quantity');
      }
      this.executeSpotFill(balances, base, account.quoteAsset, params.side, quantity, fillPrice, fees);
      await this.accounts.persistBalances(this.accountId, balances);
      await this.accounts.recordFill({
        paperAccountId: this.accountId,
        orderId,
        symbol: params.symbol,
        side: params.side,
        type: 'MARKET',
        price: fillPrice,
        quantity,
        fee: applyFee(fillPrice * quantity, fees.takerBps),
        feeAsset: account.quoteAsset,
      });
      return this.buildOrder({
        id: orderId,
        symbol: params.symbol,
        side: params.side,
        type: 'MARKET',
        status: 'FILLED',
        price: fillPrice,
        quantity,
        filledQuantity: quantity,
      });
    }

    if (params.type === 'LIMIT' && params.price) {
      const quantity = this.resolveQuantity(params, params.price);
      this.lockForLimit(balances, base, account.quoteAsset, params.side, quantity, params.price);
      await this.accounts.persistBalances(this.accountId, balances);
      this.openOrders.set(orderId, {
        id: orderId,
        symbol: params.symbol,
        side: params.side,
        type: 'LIMIT',
        price: params.price,
        quantity,
        createdAt: Date.now(),
      });
      return this.buildOrder({
        id: orderId,
        symbol: params.symbol,
        side: params.side,
        type: 'LIMIT',
        status: 'NEW',
        price: params.price,
        quantity,
        filledQuantity: 0,
      });
    }

    if (params.type === 'STOP_LOSS_LIMIT' && params.price && params.stopPrice) {
      const quantity = this.resolveQuantity(params, params.price);
      this.lockForLimit(balances, base, account.quoteAsset, params.side, quantity, params.price);
      await this.accounts.persistBalances(this.accountId, balances);
      this.openOrders.set(orderId, {
        id: orderId,
        symbol: params.symbol,
        side: params.side,
        type: 'STOP_LOSS_LIMIT',
        price: params.price,
        stopPrice: params.stopPrice,
        quantity,
        createdAt: Date.now(),
      });
      return this.buildOrder({
        id: orderId,
        symbol: params.symbol,
        side: params.side,
        type: 'STOP_LOSS_LIMIT',
        status: 'NEW',
        price: params.price,
        quantity,
        stopPrice: params.stopPrice,
        filledQuantity: 0,
      });
    }

    throw new NotImplementedByExchangeError(this.id, `placeOrder type=${params.type}`);
  }

  async cancelOrder(_symbol: string, orderId: string): Promise<Order> {
    const open = this.openOrders.get(orderId);
    if (!open) throw new OrderRejectedError(this.id, `order ${orderId} not open`);
    const account = await this.accounts.get(this.accountId);
    const balances = this.accounts.readBalances(account);
    const base = open.symbol.replace(account.quoteAsset, '');
    this.unlock(balances, base, account.quoteAsset, open.side, open.quantity, open.price ?? 0);
    await this.accounts.persistBalances(this.accountId, balances);
    this.openOrders.delete(orderId);
    return this.buildOrder({
      id: open.id,
      symbol: open.symbol,
      side: open.side,
      type: open.type,
      status: 'CANCELED',
      price: open.price ?? 0,
      quantity: open.quantity,
      filledQuantity: 0,
    });
  }

  async cancelAllOrders(symbol: string): Promise<number> {
    const targets = Array.from(this.openOrders.values()).filter((o) => o.symbol === symbol);
    for (const t of targets) await this.cancelOrder(symbol, t.id);
    return targets.length;
  }

  async getOrder(_symbol: string, orderId: string): Promise<Order> {
    const open = this.openOrders.get(orderId);
    if (!open) throw new OrderRejectedError(this.id, `order ${orderId} not found`);
    await this.tryFill(open);
    const stillOpen = this.openOrders.get(orderId);
    return this.buildOrder({
      id: open.id,
      symbol: open.symbol,
      side: open.side,
      type: open.type,
      status: stillOpen ? 'NEW' : 'FILLED',
      price: open.price ?? 0,
      quantity: open.quantity,
      filledQuantity: stillOpen ? 0 : open.quantity,
    });
  }

  async getOpenOrders(symbol?: string): Promise<Order[]> {
    await this.tryFillAll();
    const list = Array.from(this.openOrders.values()).filter((o) =>
      symbol ? o.symbol === symbol : true,
    );
    return list.map((o) =>
      this.buildOrder({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        status: 'NEW',
        price: o.price ?? 0,
        quantity: o.quantity,
        stopPrice: o.stopPrice,
        filledQuantity: 0,
      }),
    );
  }

  async getTrades(): Promise<Trade[]> {
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

  private resolveQuantity(params: PlaceOrderParams, refPrice: number): number {
    if (params.quantity && params.quantity > 0) return params.quantity;
    if (params.quoteQuantity && params.quoteQuantity > 0 && refPrice > 0) {
      return params.quoteQuantity / refPrice;
    }
    return 0;
  }

  private executeSpotFill(
    balances: PaperBalances,
    base: string,
    quote: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
    fees: FeesConfig,
  ): void {
    const notional = price * quantity;
    const feeAmt = applyFee(notional, fees.takerBps);
    const quoteBal = ensureBalance(balances, quote);
    const baseBal = ensureBalance(balances, base);

    if (side === 'BUY') {
      const required = notional + feeAmt;
      if (quoteBal.free < required) {
        throw new InsufficientBalanceError(this.id, quote, required, quoteBal.free);
      }
      quoteBal.free -= required;
      const prevQty = baseBal.free + baseBal.locked;
      const prevAvg = baseBal.avgEntry ?? 0;
      baseBal.free += quantity;
      baseBal.avgEntry =
        prevQty + quantity > 0
          ? (prevAvg * prevQty + price * quantity) / (prevQty + quantity)
          : price;
    } else {
      if (baseBal.free < quantity) {
        throw new InsufficientBalanceError(this.id, base, quantity, baseBal.free);
      }
      baseBal.free -= quantity;
      quoteBal.free += notional - feeAmt;
      if (baseBal.free + baseBal.locked <= 0) baseBal.avgEntry = undefined;
    }
  }

  private lockForLimit(
    balances: PaperBalances,
    base: string,
    quote: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
  ): void {
    if (side === 'BUY') {
      const required = quantity * price;
      const quoteBal = ensureBalance(balances, quote);
      if (quoteBal.free < required) {
        throw new InsufficientBalanceError(this.id, quote, required, quoteBal.free);
      }
      quoteBal.free -= required;
      quoteBal.locked += required;
    } else {
      const baseBal = ensureBalance(balances, base);
      if (baseBal.free < quantity) {
        throw new InsufficientBalanceError(this.id, base, quantity, baseBal.free);
      }
      baseBal.free -= quantity;
      baseBal.locked += quantity;
    }
  }

  private unlock(
    balances: PaperBalances,
    base: string,
    quote: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price: number,
  ): void {
    if (side === 'BUY') {
      const required = quantity * price;
      const quoteBal = ensureBalance(balances, quote);
      quoteBal.locked -= required;
      quoteBal.free += required;
    } else {
      const baseBal = ensureBalance(balances, base);
      baseBal.locked -= quantity;
      baseBal.free += quantity;
    }
  }

  private async tryFillAll(): Promise<void> {
    for (const order of Array.from(this.openOrders.values())) {
      await this.tryFill(order);
    }
  }

  private async tryFill(order: OpenPaperOrder): Promise<void> {
    if (!this.openOrders.has(order.id)) return;
    const ticker = await this.getTicker(order.symbol).catch(() => null);
    if (!ticker) return;
    const price = ticker.price;
    let shouldFill = false;
    if (order.type === 'LIMIT' && order.price !== undefined) {
      shouldFill =
        (order.side === 'BUY' && price <= order.price) ||
        (order.side === 'SELL' && price >= order.price);
    } else if (order.type === 'STOP_LOSS_LIMIT' && order.stopPrice !== undefined) {
      const triggered =
        (order.side === 'BUY' && price >= order.stopPrice) ||
        (order.side === 'SELL' && price <= order.stopPrice);
      if (triggered && order.price !== undefined) {
        shouldFill =
          (order.side === 'BUY' && price <= order.price) ||
          (order.side === 'SELL' && price >= order.price);
      }
    }
    if (!shouldFill || order.price === undefined) return;

    const account = await this.accounts.get(this.accountId);
    const fees = this.accounts.readFees(account);
    const balances = this.accounts.readBalances(account);
    const base = order.symbol.replace(account.quoteAsset, '');

    this.unlock(balances, base, account.quoteAsset, order.side, order.quantity, order.price);
    this.executeSpotFill(
      balances,
      base,
      account.quoteAsset,
      order.side,
      order.quantity,
      order.price,
      fees,
    );
    await this.accounts.persistBalances(this.accountId, balances);
    await this.accounts.recordFill({
      paperAccountId: this.accountId,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      price: order.price,
      quantity: order.quantity,
      fee: applyFee(order.price * order.quantity, fees.takerBps),
      feeAsset: account.quoteAsset,
    });
    this.openOrders.delete(order.id);
  }

  private balanceToPosition(base: string, quote: string, b: { free: number; locked: number; avgEntry?: number }): Position {
    const qty = totalOf({ free: b.free, locked: b.locked });
    return {
      symbol: `${base}${quote}`,
      exchange: this.id,
      side: qty > 0 ? 'LONG' : 'FLAT',
      quantity: qty,
      entryPrice: b.avgEntry ?? 0,
      markPrice: 0,
      unrealizedPnl: 0,
      realizedPnl: 0,
      market: 'SPOT',
      openedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private buildOrder(input: {
    id: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT';
    status: OrderStatus;
    price: number;
    quantity: number;
    filledQuantity: number;
    stopPrice?: number;
  }): Order {
    return {
      id: input.id,
      exchange: this.id,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      status: input.status,
      price: input.price,
      stopPrice: input.stopPrice,
      quantity: input.quantity,
      filledQuantity: input.filledQuantity,
      averagePrice: input.filledQuantity > 0 ? input.price : 0,
      quoteQuantity: input.filledQuantity * input.price,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      market: 'SPOT',
    };
  }
}
