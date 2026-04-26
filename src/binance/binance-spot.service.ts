import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BinanceAuthService } from './binance-auth.service';
import { StrategyOpsService } from 'src/strategy-monitoring/strategy-ops.service';

@Injectable()
export class BinanceSpotService {
  constructor(
    private readonly auth: BinanceAuthService,
    private readonly strategyOps: StrategyOpsService,
  ) {}

  private floorToStep(quantity: number, stepSize: number): number {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 0;
    }

    if (!Number.isFinite(stepSize) || stepSize <= 0) {
      return quantity;
    }

    const steps = Math.floor(quantity / stepSize);
    return Number((steps * stepSize).toFixed(12));
  }

  private extractBaseAsset(symbol: string): string {
    const knownQuotes = ['USDT', 'FDUSD', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB', 'TRY'];
    const quote = knownQuotes.find((q) => symbol.endsWith(q));
    if (!quote) {
      return symbol.slice(0, 3);
    }

    return symbol.slice(0, symbol.length - quote.length);
  }

  async createLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string, price: string, timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC') {
    const context = this.auth.getContext();
    if (context) {
      this.strategyOps.assertRisk(context, side, Number(quantity), Number(price));
    }

    const params: Record<string, string> = { symbol, side, type: 'LIMIT', quantity, price, timeInForce };
    if (context) {
      params.newClientOrderId = this.strategyOps.buildClientOrderId(context, side, 'spot');
    }

    const response = await this.auth.postSigned('/api/v3/order', params);

    if (context) {
      await this.strategyOps.recordOrderPlacement(context, {
        side,
        type: 'LIMIT',
        market: 'spot',
        quantity: Number(quantity),
        requestedPrice: Number(price),
        response,
      });
    }

    return response;
  }

  async createMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string) {
    const context = this.auth.getContext();
    if (context) {
      this.strategyOps.assertRisk(context, side, Number(quantity));
    }

    const params: Record<string, string> = { symbol, side, type: 'MARKET', quantity };
    if (context) {
      params.newClientOrderId = this.strategyOps.buildClientOrderId(context, side, 'spot');
    }

    const response = await this.auth.postSigned('/api/v3/order', params);

    if (context) {
      await this.strategyOps.recordOrderPlacement(context, {
        side,
        type: 'MARKET',
        market: 'spot',
        quantity: Number(quantity),
        response,
      });
    }

    return response;
  }

  async createOcoOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string, price: string, stopPrice: string, stopLimitPrice: string, stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC') {
    const serverTime = await this.auth.getServerTime();
    const allParams = {
      symbol,
      side,
      quantity,
      price,
      stopPrice,
      stopLimitPrice,
      stopLimitTimeInForce,
      timestamp: serverTime,
      recvWindow: 10000,
    };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.auth.sign(queryString);
    const url = `${this.auth.getBaseUrl()}/api/v3/order/oco?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
      httpsAgent: this.auth.getHttpsAgent(),
    });

    return response.data;
  }

  async createStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {},
  ) {
    const serverTime = await this.auth.getServerTime();
    const params = {
      symbol,
      side,
      type: 'STOP_LOSS_LIMIT',
      quantity,
      price: stopPrice,
      stopPrice,
      timeInForce: 'GTC',
      timestamp: serverTime,
      recvWindow: 10000,
      ...options,
    };

    return this.auth.postSigned('/api/v3/order', params);
  }

  async checkOrderStatus(symbol: string, orderId: number) {
    const params = { symbol, orderId, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    const response = await this.auth.getSigned('/api/v3/order', params);
    return response;
  }

  async cancelOrder(symbol: string, orderId?: number) {
    const params: Record<string, string | number> = { symbol, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };

    if (orderId !== undefined) {
      params.orderId = orderId;
    }

    const serverTime = params.timestamp as number;
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.auth.sign(queryString);
    const url = `${this.auth.getBaseUrl()}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await axios.delete(url, {
      headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
      httpsAgent: this.auth.getHttpsAgent(),
    });

    return response.data;
  }

  async getAllOrders(symbol: string, limit = 500, fromId?: number) {
    const params: Record<string, string | number> = { symbol, limit, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };

    if (fromId !== undefined) {
      params.fromId = fromId;
    }

    return this.auth.getSigned('/api/v3/allOrders', params);
  }

  async getCandles(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<{ open: string; high: string; low: string; close: string; volume: string; openTime: number; closeTime: number }[]> {
    const params = { symbol, interval, limit };
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const url = `${this.auth.getBaseUrl()}/api/v3/klines?${queryString}`;

    const response = await axios.get(url, {
      httpsAgent: this.auth.getHttpsAgent(),
    });

    return response.data.map((kline: any[]) => ({
      openTime: kline[0],
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
      closeTime: kline[6],
    }));
  }

  async cancelAllOrders(symbol: string) {
    try {
      const params = { symbol, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
      const queryString = query.toString();

      const signature = this.auth.sign(queryString);
      const url = `${this.auth.getBaseUrl()}/api/v3/openOrders?${queryString}&signature=${signature}`;

      const response = await axios.get(url, {
        headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
        httpsAgent: this.auth.getHttpsAgent(),
      });

      const openOrders = response.data;
      const cancelPromises = openOrders.map((order: any) => this.cancelOrder(symbol, order.orderId));
      await Promise.all(cancelPromises);

      return {
        message: `Se cancelaron ${openOrders.length} órdenes para el símbolo ${symbol}`,
        canceledOrdersCount: openOrders.length,
      };
    } catch (error) {
      throw new Error('Error cancelando todas las órdenes: ' + error.message);
    }
  }

  async getSymbolPrice(symbol: string) {
    const params = { symbol };
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const url = `${this.auth.getBaseUrl()}/api/v3/ticker/price?${queryString}`;

    const response = await axios.get(url, {
      httpsAgent: this.auth.getHttpsAgent(),
    });

    return response.data;
  }

  async obtenerFiltrosSimbolo(symbol: string) {
    const url = `${this.auth.getBaseUrl()}/api/v3/exchangeInfo`;
    const response = await axios.get(url, { httpsAgent: this.auth.getHttpsAgent() });

    const symbolInfo = response.data.symbols.find((s: any) => s.symbol === symbol);
    if (!symbolInfo) {
      throw new Error(`Símbolo ${symbol} no encontrado en exchangeInfo`);
    }

    const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');

    return { priceFilter, lotSizeFilter };
  }

  async getSymbolTickSize(symbol: string): Promise<number> {
    const { priceFilter } = await this.obtenerFiltrosSimbolo(symbol);
    if (!priceFilter || !priceFilter.tickSize) {
      throw new Error(`No se pudo obtener tickSize para el símbolo ${symbol}`);
    }
    return parseFloat(priceFilter.tickSize);
  }

  async getDecimalsForSymbol(symbol: string): Promise<{ priceDecimals: number; quantityDecimals: number }> {
    const { priceFilter, lotSizeFilter } = await this.obtenerFiltrosSimbolo(symbol);

    if (!priceFilter || !lotSizeFilter) {
      throw new Error(`No se encontraron filtros para el símbolo ${symbol}`);
    }

    const countDecimals = (numStr: string) => {
      const decimalPart = numStr.split('.')[1];
      return decimalPart ? decimalPart.replace(/0+$/, '').length : 0;
    };

    const priceDecimals = countDecimals(priceFilter.tickSize);
    const quantityDecimals = countDecimals(lotSizeFilter.stepSize);

    return { priceDecimals, quantityDecimals };
  }

  getFloorToStep(): (quantity: number, stepSize: number) => number {
    return (quantity, stepSize) => this.floorToStep(quantity, stepSize);
  }

  getExtractBaseAsset(): (symbol: string) => string {
    return (symbol) => this.extractBaseAsset(symbol);
  }
}
