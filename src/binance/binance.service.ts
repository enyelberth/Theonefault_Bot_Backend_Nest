import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import * as https from 'https';

@Injectable()
export class BinanceService {
  private readonly API_KEY: string;
  private readonly API_SECRET: string;
  private readonly httpsAgent: https.Agent;

  constructor() {
    this.API_KEY = process.env.BINANCE_API_KEY || '';
    this.API_SECRET = process.env.BINANCE_API_SECRET || '';
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // ⚠️ Solo para desarrollo - no usar en producción
    });
  }

  sign(querystring: string): string {
    return crypto.createHmac('sha256', this.API_SECRET)
      .update(querystring)
      .digest('hex');
  }
  //Firmas 

  async getServerTime(): Promise<number> {
    const url = `${process.env.BASE_URL}/api/v3/time`;
    const response = await axios.get(url, { httpsAgent: this.httpsAgent });
    return response.data.serverTime;
  }

  async postSigned(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getSigned(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  //Create ordenes 
  async createLimitOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string, price: string, timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC') {
    const params = { symbol, side, type: 'LIMIT', quantity, price, timeInForce };
    return this.postSigned('/api/v3/order', params);
  }

 
  async createMarketOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string) {
    const params = { symbol, side, type: 'MARKET', quantity };
    return this.postSigned('/api/v3/order', params);
  }
  async getSymbolTickSize(symbol: string): Promise<number> {
    const { priceFilter } = await this.obtenerFiltrosSimbolo(symbol);
    if (!priceFilter || !priceFilter.tickSize) {
      throw new Error(`No se pudo obtener tickSize para el símbolo ${symbol}`);
    }
    return parseFloat(priceFilter.tickSize);
  }

  async createOcoOrder(symbol: string, side: 'BUY' | 'SELL', quantity: string, price: string, stopPrice: string, stopLimitPrice: string, stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC') {
    const serverTime = await this.getServerTime();
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

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/order/oco?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async checkOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = { symbol, orderId, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async cancelOrder(symbol: string, orderId?: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = { symbol, timestamp: serverTime, recvWindow: 10000 };

    // Si se pasa orderId cancela esa orden, sino cancela todas (opcional)
    if (orderId !== undefined) {
      params.orderId = orderId;
    }

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await axios.delete(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  // Función para obtener precio de la crypto según el par (símbolo)
  async getSymbolPrice(symbol: string) {
    const params = { symbol };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const url = `${process.env.BASE_URL}/api/v3/ticker/price?${queryString}`;

    const response = await axios.get(url, {
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async obtenerFiltrosSimbolo(symbol: string) {
    const url = `${process.env.BASE_URL}/api/v3/exchangeInfo`;
    const response = await axios.get(url, { httpsAgent: this.httpsAgent });

    const symbolInfo = response.data.symbols.find((s: any) => s.symbol === symbol);
    if (!symbolInfo) {
      throw new Error(`Símbolo ${symbol} no encontrado en exchangeInfo`);
    }

    const priceFilter = symbolInfo.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
    const lotSizeFilter = symbolInfo.filters.find((f: any) => f.filterType === 'LOT_SIZE');

    return { priceFilter, lotSizeFilter };
  }
  // Saldo Spot (ya tienes función getAccountInfo que lo devuelve pero aquí es directo a balances)
  async getSpotBalances() {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.balances.filter((asset: any) => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0);
  }

  // Saldo Margin Cruzado
  async getCrossMarginBalances() {
    const crossMarginInfo = await this.getCrossMarginAccountInfo();
    return crossMarginInfo.userAssets.filter((asset: any) => parseFloat(asset.free) > 0 || parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) > 0);
  }
  async borrowCrossMargin(asset: string, amount: string) {
    const serverTime = await this.getServerTime();
    const params = { asset, amount, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/loan?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async repayCrossMargin(asset: string, amount: string) {
    const serverTime = await this.getServerTime();
    const params = { asset, amount, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/repay?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }


  // Saldo Margin Aislado
  async getIsolatedMarginBalances() {
    const isolatedMarginInfo = await this.getAccountBalanceMarginIsolated();
    // La función getAccountBalanceMarginIsolated ya devuelve las assets aisladas, puedes filtrar si quieres
    return isolatedMarginInfo.filter((asset: any) =>
      (asset.baseAsset && (parseFloat(asset.baseAsset.free) > 0 || parseFloat(asset.baseAsset.locked) > 0)) ||
      (asset.quoteAsset && (parseFloat(asset.quoteAsset.free) > 0 || parseFloat(asset.quoteAsset.locked) > 0))
    );
  }
  async transferBetweenSpotAndCrossMargin(asset: string, amount: string, type: 1 | 2) {
    const serverTime = await this.getServerTime();
    const params = { asset, amount, type, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/transfer?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }


  //Obtener saldos 
  async getAllOrders(symbol: string, limit = 500, fromId?: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = { symbol, limit, timestamp: serverTime, recvWindow: 10000 };

    if (fromId !== undefined) {
      params.fromId = fromId;
    }

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/allOrders?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getAccountInfo() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getFullCrossMarginBalance() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };
    return this.getSigned('/sapi/v1/margin/account', params);
  }
  async getCrossMarginLoans() {
    const accountInfo = await this.getCrossMarginAccountInfo();
    //console.log(accountInfo)
//const loans = accountInfo.userAssets.filter((asset: any) => parseFloat(asset.borrowed) > 0);
    return accountInfo;
  }


  async getCrossMarginAccountInfo() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    // CORRECCIÓN AQUÍ: Cambia api por sapi
    const url = `${process.env.BASE_URL}/sapi/v1/margin/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getNonZeroBalances() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    // Filtra activos con balance libre o bloqueado mayor que 0
    const balances = response.data.balances.filter(
      (asset: any) => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0
    );

    return balances;
  }






  async getIsolatedMarginAccountInfo(symbol: string) {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000, symbol };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v1/margin/isolated/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getFuturesAccountBalance() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/fapi/v2/balance?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
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
    const serverTime = await this.getServerTime();
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

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getCandles(
    symbol: string,
    interval: string,
    limit: number
  ): Promise<{ open: string; high: string; low: string; close: string; volume: string; openTime: number; closeTime: number; }[]> {
    const params = { symbol, interval, limit };
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const url = `${process.env.BASE_URL}/api/v3/klines?${queryString}`;

    const response = await axios.get(url, {
      httpsAgent: this.httpsAgent,
    });

    // El endpoint devuelve arrays por vela, con esta estructura:
    // [
    //   0 Open time,
    //   1 Open,
    //   2 High,
    //   3 Low,
    //   4 Close,
    //   5 Volume,
    //   6 Close time,
    //   ...
    // ]

    // Lo transformamos a objetos con propiedades explícitas
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
      // 1. Obtener todas las órdenes abiertas para el símbolo
      const serverTime = await this.getServerTime();
      const params = { symbol, timestamp: serverTime, recvWindow: 10000 };
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
      const queryString = query.toString();

      const signature = this.sign(queryString);
      const url = `${process.env.BASE_URL}/api/v3/openOrders?${queryString}&signature=${signature}`;

      const response = await axios.get(url, {
        headers: { 'X-MBX-APIKEY': this.API_KEY },
        httpsAgent: this.httpsAgent,
      });

      const openOrders = response.data;

      // 2. Cancelar cada orden abierta
      const cancelPromises = openOrders.map((order: any) => this.cancelOrder(symbol, order.orderId));

      // Esperar a que se cancelen todas las órdenes
      await Promise.all(cancelPromises);

      return {
        message: `Se cancelaron ${openOrders.length} órdenes para el símbolo ${symbol}`,
        canceledOrdersCount: openOrders.length,
      };
    } catch (error) {
      throw new Error('Error cancelando todas las órdenes: ' + error.message);
    }
  }





  async getAccountBalancesAll() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async createCrossMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC'
  ) {
    const params = { symbol, side, type: 'LIMIT', quantity, price, timeInForce };
    return this.postSigned('/sapi/v1/margin/order', params);
  }

  async createCrossMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string
  ) {
    const params = { symbol, side, type: 'MARKET', quantity };
    return this.postSigned('/sapi/v1/margin/order', params);
  }


  async createIsolatedMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC'
  ) {
    const params = { symbol, side, type: 'LIMIT', quantity, price, timeInForce, isIsolated: 'TRUE' };
    return this.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async createIsolatedMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string
  ) {
    const params = { symbol, side, type: 'MARKET', quantity, isIsolated: 'TRUE' };
    return this.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async getAccountBalanceMarginIsolated() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/isolated/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data.assets;
  }
  // Obtener todas las órdenes abiertas en margin cruzado para un símbolo
  async getAllCrossMarginOrders(symbol: string, limit = 500, fromId?: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = { symbol, limit, timestamp: serverTime, recvWindow: 10000 };
    if (fromId !== undefined) params.fromId = fromId;

    return this.getSigned('/sapi/v1/margin/openOrders', params);
  }

  // Consultar una orden específica margin cruzado
  async getCrossMarginOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = { symbol, orderId, timestamp: serverTime, recvWindow: 10000 };
    return this.getSigned('/sapi/v1/margin/order', params);
  }

  // Cancelar todas las órdenes abiertas margin cruzado para un símbolo
  async cancelAllCrossMarginOrders(symbol: string) {
    try {
      const serverTime = await this.getServerTime();
      const params = { symbol, timestamp: serverTime, recvWindow: 10000 };
      const queryString = new URLSearchParams(params as any).toString();
      const signature = this.sign(queryString);
      const url = `${process.env.BASE_URL}/sapi/v1/margin/openOrders?${queryString}&signature=${signature}`;
      const response = await axios.get(url, {
        headers: { 'X-MBX-APIKEY': this.API_KEY },
        httpsAgent: this.httpsAgent,
      });
      const openOrders = response.data;
      // Cancelar cada orden
      const cancelPromises = openOrders.map((order: any) => this.cancelCrossMarginOrder(symbol, order.orderId));
      await Promise.all(cancelPromises);
      return {
        message: `Se cancelaron ${openOrders.length} órdenes de margin cruzado para el símbolo ${symbol}`,
        canceledOrdersCount: openOrders.length,
      };
    } catch (error) {
      throw new Error('Error cancelando todas las órdenes de margin cruzado: ' + (error as Error).message);
    }
  }

  // Función auxiliar para cancelar una orden margin cruzado

  async cancelCrossMarginOrder(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = {
      symbol,
      orderId,
      timestamp: serverTime,
      recvWindow: 10000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await axios.delete(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
async cancelAllCrossMarginOrdersBySide(symbol: string, side: 'BUY' | 'SELL') {
  try {
    const openOrders = await this.getAllCrossMarginOrders(symbol);
    const ordersToCancel = openOrders.filter((order: any) => order.side === side);

    const cancelResults = await Promise.allSettled(
      ordersToCancel.map((order: any) =>
        this.cancelCrossMarginOrder(symbol, order.orderId)
      )
    );

    const rejected = cancelResults.filter(r => r.status === 'rejected');
    if (rejected.length > 0) {
      // Puedes loggear o manejar estos errores individualmente.
      console.warn(`Falló la cancelación de ${rejected.length} órdenes.`);
    }

    return {
      message: `Se intentaron cancelar ${ordersToCancel.length} órdenes. Éxitos: ${cancelResults.length - rejected.length}, Fallos: ${rejected.length}`,
      canceledOrdersCount: cancelResults.length - rejected.length,
      failedOrdersCount: rejected.length,
    };
  } catch (error) {
    throw new Error('Error cancelando órdenes margin cruzado por lado: ' + (error as Error).message);
  }
}

  async checkCrossMarginOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = { symbol, orderId, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async createCrossMarginStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {}
  ) {
    const serverTime = await this.getServerTime();
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

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

async createCrossMarginOcoOrder(
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: string,
  price: string,
  stopPrice: string,
  stopLimitPrice: string,
  stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
) {
  const serverTime = await this.getServerTime();
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

  const signature = this.sign(queryString);
  const url = `${process.env.BASE_URL}/sapi/v1/margin/order/oco?${queryString}&signature=${signature}`;

  const response = await axios.post(url, null, {
    headers: { 'X-MBX-APIKEY': this.API_KEY },
    httpsAgent: this.httpsAgent,
  });

  return response.data;
}
 async getCrossMarginPositions() {
    try {
      const response = await this.getSignedRequest('/sapi/v1/margin/positionRisk', {}, 'GET');
      console.debug('Respuesta getCrossMarginPositions:', response.data);
      if (!Array.isArray(response.data)) {
        throw new Error('La respuesta no es un array de posiciones');
      }
      return response.data;
    } catch (error) {
      throw new Error(`Error obteniendo posiciones margin cruzado: ${(error as Error).message}`);
    }
  }

  async getCrossMarginPosition(symbol: string) {
    const positions = await this.getCrossMarginPositions();
    const position = positions.find((pos: any) => pos.symbol === symbol);
    if (!position) {
      throw new Error(`No hay posición abierta para el símbolo ${symbol}`);
    }
    return position;
  }

  async getCrossMarginUnrealizedProfit(symbol: string) {
    const position = await this.getCrossMarginPosition(symbol);
    return {
      symbol,
      positionAmt: position.positionAmt,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
      unRealizedProfit: parseFloat(position.unRealizedProfit),
    };
  }
  

  async getCrossMarginProfitPercent(symbol: string) {
    const { entryPrice, markPrice, positionAmt } = await this.getCrossMarginUnrealizedProfit(symbol);
    if (parseFloat(entryPrice) === 0) return 0;
    const profitPercent = ((parseFloat(markPrice) - parseFloat(entryPrice)) / parseFloat(entryPrice)) * 100;
    return profitPercent * (parseFloat(positionAmt) >= 0 ? 1 : -1);
  }
    private async getSignedRequest(endpoint: string, params: Record<string, string | number>, method: 'GET' | 'POST' | 'DELETE' = 'GET') {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 10000 };
    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();
    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const config = {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    };

    if (method === 'GET') {
      return axios.get(url, config);
    } else if (method === 'POST') {
      return axios.post(url, null, config);
    } else if (method === 'DELETE') {
      return axios.delete(url, config);
    } else {
      throw new Error(`Unsupported method ${method}`);
    }
  }
  async calculateCrossMarginSummary() {
  const accountInfo = await this.getCrossMarginAccountInfo();

  const marginLevel = parseFloat(accountInfo.marginLevel);
  const totalAsset = parseFloat(accountInfo.totalAssetOfBtc);
  const totalLiability = parseFloat(accountInfo.totalLiabilityOfBtc);
  const totalNetAsset = parseFloat(accountInfo.totalNetAssetOfBtc);

  // Ganancia / pérdida neta = total neto de activos
  const netProfitLoss = totalNetAsset;

  // Retornar resumen
  return {
    marginLevel,
    totalAsset,
    totalLiability,
    netProfitLoss,
    userAssets: accountInfo.userAssets.map((asset: any) => ({
      asset: asset.asset,
      free: parseFloat(asset.free),
      borrowed: parseFloat(asset.borrowed),
      interest: parseFloat(asset.interest),
      netAsset: parseFloat(asset.netAsset),
    })),
  };
}

// En su BinanceService.ts

async getCrossMarginPNLSummary() {
    // Reutilizamos la función existente para obtener la información de la cuenta
    const accountInfo = await this.getCrossMarginAccountInfo();

    const marginLevel = parseFloat(accountInfo.marginLevel);
    const totalNetAssetOfBtc = parseFloat(accountInfo.totalNetAssetOfBtc);
    const totalLiabilityOfBtc = parseFloat(accountInfo.totalLiabilityOfBtc);
    
    const unrealizedPNL = totalNetAssetOfBtc;

    // 💡 CORRECCIÓN TS2454: Asignar un valor inicial por defecto.
    let liquidationStatus: string = 'Estado no determinado';
    let riskLevel: 'BAJO' | 'MEDIO' | 'ALTO' | 'CRÍTICO' | 'LIQUIDACIÓN INMINENTE' = 'BAJO'; 
    
    // Los umbrales varían según la configuración de Binance. Usamos valores comunes:
    const WARNING_LEVEL = 1.5; // Nivel de Advertencia/Llamada de Margen inicial
    const CRITICAL_LEVEL = 1.1; // Nivel donde la liquidación es cercana

    if (marginLevel > WARNING_LEVEL) {
      riskLevel = 'BAJO';
      liquidationStatus = 'El Nivel de Margen es saludable.';
    } else if (marginLevel > CRITICAL_LEVEL) {
      riskLevel = 'MEDIO';
      liquidationStatus = `El Nivel de Margen (${marginLevel.toFixed(4)}) está por debajo de ${WARNING_LEVEL}. Considere añadir colateral.`;
    } else if (marginLevel > 1.0) {
      riskLevel = 'ALTO';
      liquidationStatus = `¡ATENCIÓN! Nivel de Margen (${marginLevel.toFixed(4)}) muy cerca del límite de liquidación. Necesita añadir colateral URGENTE.`;
    } else if (marginLevel <= 1.0) {
      riskLevel = 'CRÍTICO';
      liquidationStatus = `¡PELIGRO DE LIQUIDACIÓN! Nivel de Margen en ${marginLevel.toFixed(4)}. La liquidación forzosa es inminente o ya está en proceso.`;
    }

    // Calcular el porcentaje de PNL (basado en la deuda/pasivo, ya que el capital inicial no está disponible)
    const pnlPercentage = totalLiabilityOfBtc > 0 
      ? (unrealizedPNL / totalLiabilityOfBtc) * 100 
      : 0; 

    return {
      totalUnrealizedPNL: unrealizedPNL.toFixed(8),
      pnlCurrency: accountInfo.quoteAsset,
      marginLevel: marginLevel.toFixed(8),
      riskLevel: riskLevel, // ✅ Ahora está garantizado que tiene un valor
      liquidationStatus: liquidationStatus, // ✅ Ahora está garantizado que tiene un valor
      totalLiabilityOfBtc: totalLiabilityOfBtc.toFixed(8),
      pnlAsPercentageOfLiability: pnlPercentage.toFixed(2),
      assetsSummary: accountInfo.userAssets
        .filter((asset: any) => parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) !== 0)
        .map((asset: any) => ({
          asset: asset.asset,
          netAsset: parseFloat(asset.netAsset).toFixed(8),
          borrowed: parseFloat(asset.borrowed).toFixed(8),
        })),
    };
}

  async firmar() {
    // Función vacía o con la lógica que necesites implementar
  }
}
