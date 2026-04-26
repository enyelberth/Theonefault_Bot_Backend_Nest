import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { BinanceAuthService } from './binance-auth.service';
import { BinanceAccountService } from './binance-account.service';
import { BinanceSpotService } from './binance-spot.service';
import { StrategyOpsService } from 'src/strategy-monitoring/strategy-ops.service';
import { PendingLiquidation } from 'src/strategy-monitoring/strategy-ops.service';

@Injectable()
export class BinanceMarginService {
  constructor(
    private readonly auth: BinanceAuthService,
    private readonly account: BinanceAccountService,
    private readonly spot: BinanceSpotService,
    private readonly strategyOps: StrategyOpsService,
  ) {}

  private extractBaseAsset(symbol: string): string {
    const knownQuotes = ['USDT', 'FDUSD', 'BUSD', 'USDC', 'BTC', 'ETH', 'BNB', 'TRY'];
    const quote = knownQuotes.find((q) => symbol.endsWith(q));
    if (!quote) {
      return symbol.slice(0, 3);
    }
    return symbol.slice(0, symbol.length - quote.length);
  }

  private async executeRiskLiquidation(trigger: PendingLiquidation): Promise<void> {
    if (trigger.market === 'margin') {
      await this.executeCrossMarginRiskLiquidation(trigger);
      return;
    }

    await this.executeSpotRiskLiquidation(trigger);
  }

  private async executeSpotRiskLiquidation(trigger: PendingLiquidation): Promise<void> {
    await this.spot.cancelAllOrders(trigger.symbol);

    const baseAsset = this.extractBaseAsset(trigger.symbol);
    const accountInfo = await this.account.getAccountInfo();
    const balance = accountInfo.balances?.find((asset: any) => asset.asset === baseAsset);
    const freeQty = Number(balance?.free ?? 0);

    if (!Number.isFinite(freeQty) || freeQty <= 0) {
      return;
    }

    const { lotSizeFilter } = await this.spot.obtenerFiltrosSimbolo(trigger.symbol);
    const stepSize = Number(lotSizeFilter?.stepSize ?? 0);
    const qty = this.spot.getFloorToStep()(freeQty, stepSize);

    if (qty <= 0) {
      return;
    }

    const context = {
      strategyId: trigger.strategyId,
      strategyType: trigger.strategyType,
      symbol: trigger.symbol,
      config: {},
    };

    const params = {
      symbol: trigger.symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: qty.toString(),
      newClientOrderId: this.strategyOps.buildClientOrderId(context, 'SELL', 'spot'),
    };

    const response = await this.auth.postSigned('/api/v3/order', params);
    await this.strategyOps.recordOrderPlacement(context, {
      side: 'SELL',
      type: 'MARKET',
      market: 'spot',
      quantity: qty,
      response,
    });
    await this.strategyOps.recordOrderStatus(trigger.symbol, response, 'spot', context);
  }

  private async executeCrossMarginRiskLiquidation(trigger: PendingLiquidation): Promise<void> {
    if (!this.auth.canUseMargin()) {
      return;
    }

    await this.cancelAllCrossMarginOrders(trigger.symbol);

    const baseAsset = this.extractBaseAsset(trigger.symbol);
    const accountInfo = await this.account.getCrossMarginAccountInfo();
    const balance = accountInfo.userAssets?.find((asset: any) => asset.asset === baseAsset);
    const freeQty = Number(balance?.free ?? 0);

    if (!Number.isFinite(freeQty) || freeQty <= 0) {
      return;
    }

    const { lotSizeFilter } = await this.spot.obtenerFiltrosSimbolo(trigger.symbol);
    const stepSize = Number(lotSizeFilter?.stepSize ?? 0);
    const qty = this.spot.getFloorToStep()(freeQty, stepSize);

    if (qty <= 0) {
      return;
    }

    const context = {
      strategyId: trigger.strategyId,
      strategyType: trigger.strategyType,
      symbol: trigger.symbol,
      config: {},
    };

    const params = {
      symbol: trigger.symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: qty.toString(),
      newClientOrderId: this.strategyOps.buildClientOrderId(context, 'SELL', 'margin'),
    };

    const response = await this.auth.postSigned('/sapi/v1/margin/order', params);
    await this.strategyOps.recordOrderPlacement(context, {
      side: 'SELL',
      type: 'MARKET',
      market: 'margin',
      quantity: qty,
      response,
    });
    await this.strategyOps.recordOrderStatus(trigger.symbol, response, 'margin', context);
  }

  async panicLiquidateSymbol(payload: {
    strategyId: string;
    strategyType: string;
    symbol: string;
    market: 'spot' | 'margin';
  }): Promise<void> {
    const trigger: PendingLiquidation = {
      strategyId: payload.strategyId,
      strategyType: payload.strategyType,
      symbol: payload.symbol,
      market: payload.market,
      reason: 'maxDailyLoss',
      threshold: 0,
      currentDailyPnl: 0,
      triggeredAt: new Date().toISOString(),
    };

    await this.executeRiskLiquidation(trigger);
  }

  async createCrossMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC'
  ) {
    const context = this.auth.getContext();
    if (context) {
      this.strategyOps.assertRisk(context, side, Number(quantity), Number(price));
    }

    const params: Record<string, string> = { symbol, side, type: 'LIMIT', quantity, price, timeInForce };
    if (context) {
      params.newClientOrderId = this.strategyOps.buildClientOrderId(context, side, 'margin');
    }

    const response = await this.auth.postSigned('/sapi/v1/margin/order', params);

    if (context) {
      await this.strategyOps.recordOrderPlacement(context, {
        side,
        type: 'LIMIT',
        market: 'margin',
        quantity: Number(quantity),
        requestedPrice: Number(price),
        response,
      });
    }

    return response;
  }

  async createCrossMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string
  ) {
    const context = this.auth.getContext();
    if (context) {
      this.strategyOps.assertRisk(context, side, Number(quantity));
    }

    const params: Record<string, string> = { symbol, side, type: 'MARKET', quantity };
    if (context) {
      params.newClientOrderId = this.strategyOps.buildClientOrderId(context, side, 'margin');
    }

    const response = await this.auth.postSigned('/sapi/v1/margin/order', params);

    if (context) {
      await this.strategyOps.recordOrderPlacement(context, {
        side,
        type: 'MARKET',
        market: 'margin',
        quantity: Number(quantity),
        response,
      });
    }

    const liquidation = await this.strategyOps.recordOrderStatus(symbol, response, 'margin', context);
    if (liquidation) {
      await this.executeRiskLiquidation(liquidation);
    }
    return response;
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
    const url = `${this.auth.getBaseUrl()}/sapi/v1/margin/order/oco?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
      httpsAgent: this.auth.getHttpsAgent(),
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

    return this.auth.postSigned('/sapi/v1/margin/order', params);
  }

  async createIsolatedMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC'
  ) {
    const params = { symbol, side, type: 'LIMIT', quantity, price, timeInForce, isIsolated: 'TRUE' };
    return this.auth.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async createIsolatedMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string
  ) {
    const params = { symbol, side, type: 'MARKET', quantity, isIsolated: 'TRUE' };
    return this.auth.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async cancelCrossMarginOrder(symbol: string, orderId: number) {
    const params: Record<string, string | number> = {
      symbol,
      orderId,
      timestamp: await this.auth.getServerTime(),
      recvWindow: 10000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.auth.sign(queryString);
    const url = `${this.auth.getBaseUrl()}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await axios.delete(url, {
      headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
      httpsAgent: this.auth.getHttpsAgent(),
    });

    const liquidation = await this.strategyOps.recordOrderStatus(symbol, response.data, 'margin', this.auth.getContext());
    if (liquidation) {
      await this.executeRiskLiquidation(liquidation);
    }
    return response.data;
  }

  async cancelAllCrossMarginOrders(symbol: string) {
    try {
      const params = { symbol, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
      const queryString = new URLSearchParams(params as any).toString();
      const signature = this.auth.sign(queryString);
      const url = `${this.auth.getBaseUrl()}/sapi/v1/margin/openOrders?${queryString}&signature=${signature}`;
      const response = await axios.get(url, {
        headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
        httpsAgent: this.auth.getHttpsAgent(),
      });
      const openOrders = response.data;
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

  async cancelAllCrossMarginOrdersBySide(symbol: string, side: 'BUY' | 'SELL') {
    try {
      const openOrders = await this.getAllCrossMarginOrders(symbol);
      const ordersToCancel = openOrders.filter(order => order.side === side);

      if (ordersToCancel.length === 0) {
        return { message: `No hay órdenes abiertas para cancelar en ${symbol} del lado ${side}.` };
      }

      let canceledCount = 0;
      let failedCount = 0;

      for (const order of ordersToCancel) {
        try {
          await this.cancelCrossMarginOrder(symbol, order.orderId);
          canceledCount++;
        } catch (error: any) {
          if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 5;
            console.warn(`Rate limit excedido. Esperando ${retryAfter} segundos antes de reintentar.`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            try {
              await this.cancelCrossMarginOrder(symbol, order.orderId);
              canceledCount++;
            } catch {
              failedCount++;
            }
          } else {
            failedCount++;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return {
        message: `Se intentaron cancelar ${ordersToCancel.length} órdenes. Éxitos: ${canceledCount}, Fallos: ${failedCount}`,
        canceledOrdersCount: canceledCount,
        failedOrdersCount: failedCount,
      };
    } catch (error) {
      throw new Error('Error cancelando órdenes margin cruzado por lado: ' + (error as Error).message);
    }
  }

  async checkCrossMarginOrderStatus(symbol: string, orderId: number) {
    const params = { symbol, orderId, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.auth.sign(queryString);
    const url = `${this.auth.getBaseUrl()}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.auth.getApiKey() },
      httpsAgent: this.auth.getHttpsAgent(),
    });

    const liquidation = await this.strategyOps.recordOrderStatus(symbol, response.data, 'margin', this.auth.getContext());
    if (liquidation) {
      await this.executeRiskLiquidation(liquidation);
    }
    return response.data;
  }

  async getAllCrossMarginOrders(symbol: string, limit = 500, fromId?: number) {
    const params: Record<string, string | number> = { symbol, limit, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    if (fromId !== undefined) params.fromId = fromId;

    return this.auth.getSigned('/sapi/v1/margin/openOrders', params);
  }

  async getCrossMarginOrderStatus(symbol: string, orderId: number) {
    const params = { symbol, orderId, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.getSigned('/sapi/v1/margin/order', params);
  }

  async borrowCrossMargin(asset: string, amount: string) {
    const params = { asset, amount, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.postSigned('/sapi/v1/margin/loan', params);
  }

  async repayCrossMargin(asset: string, amount: string) {
    const params = { asset, amount, timestamp: await this.auth.getServerTime(), recvWindow: 10000 };
    return this.auth.postSigned('/sapi/v1/margin/repay', params);
  }

  async liquiCrossMagin(): Promise<void> {
    if (!this.auth.canUseMargin()) {
      console.log('liquiCrossMagin deshabilitado en desarrollo. Usa ENABLE_MARGIN_IN_DEV=true para habilitar margin.');
      return;
    }

    const data = await this.account.getCrossMarginSaldo();

    const debtAssets = data.assetsSummary.filter(a => parseFloat(a.borrowed) > 0);
    const sellAssets = data.assetsSummary.filter(a => a.asset === 'FDUSD' && parseFloat(a.netAsset) > 1);

    for (const debtAsset of debtAssets) {
      const sellAsset = sellAssets.length > 0 ? sellAssets[0] : null;

      if (!sellAsset) {
        console.log(`No hay FDUSD disponible para liquidar deuda de ${debtAsset.asset}`);
        continue;
      }

      const symbol = `${debtAsset.asset}${sellAsset.asset}`;
      const decimalQuantity = await this.spot.getDecimalsForSymbol(symbol);
      const priceData = await this.spot.getSymbolPrice(symbol);
      const price = parseFloat(priceData.price);

      const sellQuantity = parseFloat(sellAsset.netAsset).toFixed(decimalQuantity.quantityDecimals);

      await this.cancelAllCrossMarginOrdersBySide(symbol, 'BUY');
      await this.cancelAllCrossMarginOrdersBySide(symbol, 'SELL');

      await this.createCrossMarginMarketOrder(symbol, 'SELL', sellQuantity);

      await this.repayCrossMargin(debtAsset.asset, debtAsset.borrowed.toString());

      console.log(`Deuda de ${debtAsset.asset} liquidada usando FDUSD.`);
    }

    const nonFdusdAssets = data.assetsSummary.filter(
      a => a.asset !== 'FDUSD' && parseFloat(a.netAsset) > 1
    );

    for (const asset of nonFdusdAssets) {
      const symbol = `${asset.asset}FDUSD`;
      const decimalQuantity = await this.spot.getDecimalsForSymbol(symbol);
      const priceData = await this.spot.getSymbolPrice(symbol);
      const price = parseFloat(priceData.price);

      const sellQuantity = parseFloat(asset.netAsset).toFixed(decimalQuantity.quantityDecimals);

      await this.cancelAllCrossMarginOrdersBySide(symbol, 'BUY');
      await this.cancelAllCrossMarginOrdersBySide(symbol, 'SELL');

      await this.createCrossMarginMarketOrder(symbol, 'SELL', sellQuantity);

      console.log(`Activo ${asset.asset} vendido para convertir a FDUSD.`);
    }

    if (debtAssets.length === 0 && nonFdusdAssets.length === 0) {
      console.log('No hay deudas ni activos para convertir a FDUSD.');
    }
  }
}
