import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';
import { Order, OrderLevel } from 'src/interfaces/order';
import { LoggerMessages } from 'src/utils/logs';


@Injectable()
export class GridFullStrategy implements TradingStrategy {
  id: string;
  symbol: string;
  config: {
    ordersLevels_buy: OrderLevel[];
    ordersLevels_sell: OrderLevel[];
    gridCount: number;
    totalQuantity: number;
    profitMargin: number;
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number; // Porcentaje para reactivar niveles
  };

  private readonly logger = new Logger(GridFullStrategy.name);
  private readonly logMessages = new LoggerMessages(this.logger);
  private isRunning:boolean = true;

  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();

  private stoppedLossLevelsBuy = new Set<number>();
  private stoppedLossLevelsSell = new Set<number>();

  private profitLoss:number = 0;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logMessages.logInfo(`Starting Grid Full Strategy on ${this.symbol}`);

    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) {
      throw new Error(`Filters not found for ${this.symbol}`);
    }

    await this.cancelExistingOrdersInRange();

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();
        this.logMessages.logInfo(`Current price: ${currentPrice}`);

        this.reactivateStoppedLevels(currentPrice, 'buy');
        this.reactivateStoppedLevels(currentPrice, 'sell');

        await this.placeBuyOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);

        await this.placeSellOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);

        const sleepDuration = this.calculateSleepDuration();
        this.logMessages.logInfo(`Sleeping ${sleepDuration} ms`);
        await this.sleep(sleepDuration);
      } catch (err) {
        this.logMessages.logError('Error in monitoring loop:', err);
        await this.exponentialBackoff(30000, 5);
      }
    }
  }

  private reactivateStoppedLevels(currentPrice: number, side: 'buy' | 'sell') {
    const stoppedLevels = side === 'buy' ? this.stoppedLossLevelsBuy : this.stoppedLossLevelsSell;
    const orderLevels = side === 'buy' ? this.config.ordersLevels_buy : this.config.ordersLevels_sell;

    if (!this.config.buySafetyMargin) return;

    for (const level of [...stoppedLevels]) {
      const orderLevel = orderLevels[level];
      if (!orderLevel) continue;
      if (
        (side === 'buy' && currentPrice >= orderLevel.price * (1 + this.config.buySafetyMargin)) ||
        (side === 'sell' && currentPrice <= orderLevel.price * (1 - this.config.buySafetyMargin))
      ) {
        this.logMessages.logInfo(`Reactivating stopped ${side.toUpperCase()} level ${level} at price threshold.`);
        stoppedLevels.delete(level);
      }
    }
  }

  private async placeBuyOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (let i = 0; i < this.config.ordersLevels_buy.length; i++) {
      if (this.openBuyOrders.has(i)) continue;
      if (this.stoppedLossLevelsBuy.has(i)) continue;
      if (this.openSellOrders.has(i)) continue;

      const orderLevel = this.config.ordersLevels_buy[i];
      if (!orderLevel) continue;

      const buyPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (buyPrice >= currentPrice) continue;

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logMessages.logInfo(`Placing LIMIT BUY order at level ${i} price ${buyPrice} quantity ${quantity}`);
      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol, 'BUY', quantity.toString(), buyPrice.toString(), 'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: buyPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logMessages.logSuccess(`LIMIT BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logMessages.logError(`Error creating LIMIT BUY order at level ${i}:`, err);
      }
      await this.sleep(250);
    }
  }

  private async placeSellOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (let i = 0; i < this.config.ordersLevels_sell.length; i++) {
      if (this.openSellOrders.has(i)) continue;
      if (this.stoppedLossLevelsSell.has(i)) continue;
      if (this.openBuyOrders.has(i)) continue;

      const orderLevel = this.config.ordersLevels_sell[i];
      if (!orderLevel) continue;

      const sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (sellPrice <= currentPrice) continue;

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logMessages.logInfo(`Placing LIMIT SELL order at level ${i} price ${sellPrice} quantity ${quantity}`);
      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol, 'SELL', quantity.toString(), sellPrice.toString(), 'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: sellPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logMessages.logSuccess(`LIMIT SELL order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logMessages.logError(`Error creating LIMIT SELL order at level ${i}:`, err);
      }
      await this.sleep(250);
    }
  }

  private async checkBuyOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of this.openBuyOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);
        if (statusData.status === 'FILLED') {
          this.logMessages.logSuccess(`Order BUY level ${i} filled ID: ${order.orderId}`);
          this.openBuyOrders.delete(i);

          const orderLevel = this.config.ordersLevels_buy[i];
          if (!orderLevel) continue;

          const sellPrice = this.roundToStep(orderLevel.price * (1 + this.config.profitMargin), priceFilter.tickSize);
          const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);

          this.logMessages.logInfo(`Placing LIMIT SELL order at level ${i} price ${sellPrice}`);
          try {
            const orderSell = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol, 'SELL', quantity.toString(), sellPrice.toString(), 'GTC',
            );
            const normalizedSellOrder: Order = {
              orderId: Number(orderSell.orderId),
              price: sellPrice.toString(),
              origQty: quantity.toString(),
              timestamp: Date.now(),
              isSell: true,
            };
            this.openSellOrders.set(i, normalizedSellOrder);
            this.logMessages.logSuccess(`LIMIT SELL order created ID: ${normalizedSellOrder.orderId} at level ${i}`);
          } catch (err) {
            this.logMessages.logError(`Error creating LIMIT SELL order at level ${i}:`, err);
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logMessages.logWarn(`BUY order ID ${order.orderId} stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openBuyOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logMessages.logError(`Error canceling stuck BUY order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logMessages.logError(`Error checking BUY order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertBuyOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  private async checkSellOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of this.openSellOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);
        if (statusData.status === 'FILLED') {
          this.logMessages.logSuccess(`Order SELL level ${i} filled ID: ${order.orderId}`);
          this.openSellOrders.delete(i);

          const orderLevel = this.config.ordersLevels_sell[i];
          if (!orderLevel) continue;

          const buyPrice = this.roundToStep(orderLevel.price * (1 - this.config.profitMargin), priceFilter.tickSize);
          const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);

          this.logMessages.logInfo(`Placing LIMIT BUY order at level ${i} price ${buyPrice}`);
          try {
            const orderBuy = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol, 'BUY', quantity.toString(), buyPrice.toString(), 'GTC',
            );
            const normalizedBuyOrder: Order = {
              orderId: Number(orderBuy.orderId),
              price: buyPrice.toString(),
              origQty: quantity.toString(),
              timestamp: Date.now(),
            };
            this.openBuyOrders.set(i, normalizedBuyOrder);
            this.logMessages.logSuccess(`LIMIT BUY order created ID: ${normalizedBuyOrder.orderId} at level ${i}`);
          } catch (err) {
            this.logMessages.logError(`Error creating LIMIT BUY order at level ${i}:`, err);
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logMessages.logWarn(`SELL order ID ${order.orderId} stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openSellOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logMessages.logError(`Error canceling stuck SELL order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logMessages.logError(`Error checking SELL order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertSellOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  private async reinsertBuyOrders(levels: number[], priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    for (const i of levels) {
      const orderLevel = this.config.ordersLevels_buy[i];
      if (!orderLevel) continue;

      const buyPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (buyPrice >= currentPrice) continue;

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logMessages.logInfo(`Reinserting LIMIT BUY order at level ${i} price ${buyPrice} quantity ${quantity}`);
      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol, 'BUY', quantity.toString(), buyPrice.toString(), 'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: buyPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logMessages.logSuccess(`Reinserted LIMIT BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logMessages.logError(`Error reinserting LIMIT BUY order at level ${i}:`, err);
      }
      await this.sleep(250);
    }
  }

  private async reinsertSellOrders(levels: number[], priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    for (const i of levels) {
      const orderLevel = this.config.ordersLevels_sell[i];
      if (!orderLevel) continue;

      const sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (sellPrice <= currentPrice) continue;

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logMessages.logInfo(`Reinserting LIMIT SELL order at level ${i} price ${sellPrice} quantity ${quantity}`);
      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol, 'SELL', quantity.toString(), sellPrice.toString(), 'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: sellPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logMessages.logSuccess(`Reinserted LIMIT SELL order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logMessages.logError(`Error reinserting LIMIT SELL order at level ${i}:`, err);
      }
      await this.sleep(250);
    }
  }

  private roundToStep(value: number, step: string): number {
    const stepFloat = parseFloat(step);
    const precision = (step.split('.')[1] || '').length;
    const adjusted = Math.floor(value / stepFloat) * stepFloat;
    return parseFloat(adjusted.toFixed(precision));
  }

  private async getCurrentPrice(): Promise<number> {
    const resp = await this.binanceService.getSymbolPrice(this.symbol);
    return parseFloat(resp.price);
  }

  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private calculateSleepDuration(): number {
    const minMs = this.config.minSleepMs ?? 15000;
    const maxMs = this.config.maxSleepMs ?? minMs;
    if (maxMs <= minMs) return minMs;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }

  private async exponentialBackoff(baseDelayMs: number, maxRetries: number) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const waitTime = baseDelayMs * Math.pow(2, attempt);
      this.logMessages.logInfo(`Retrying in ${waitTime} ms...`);
      await this.sleep(waitTime);
    }
  }

  private async cancelExistingOrdersInRange() {
    try {
      const allOrders = await this.binanceService.getAllCrossMarginOrders(this.symbol, 500);
      if ((!this.config.ordersLevels_buy?.length) && (!this.config.ordersLevels_sell?.length)) {
        this.logMessages.logWarn('No buy or sell levels defined for cancellation range.');
        return;
      }

      const allPrices = [
        ...this.config.ordersLevels_buy.map(l => l.price),
        ...this.config.ordersLevels_sell.map(l => l.price),
      ];
      const lowerPrice = Math.min(...allPrices);
      const upperPrice = Math.max(...allPrices);

      const activeOrdersInRange = allOrders.filter(o =>
        !['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(o.status) &&
        Number.isFinite(Number(o.price)) &&
        Number(o.price) >= lowerPrice &&
        Number(o.price) <= upperPrice
      );

      if (activeOrdersInRange.length === 0) {
        this.logMessages.logInfo('No active orders in range.');
        return;
      }

      this.logMessages.logInfo(`Canceling orders in range [${lowerPrice}, ${upperPrice}]`);

      for (const order of activeOrdersInRange) {
        try {
          await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
          this.logMessages.logWarn(`Canceled order ID ${order.orderId} price ${order.price}`);

          // Remove from openBuyOrders or openSellOrders accordingly
          if (order.side === 'BUY') {
            for (const [level, o] of this.openBuyOrders.entries()) {
              if (o.orderId === order.orderId) {
                this.openBuyOrders.delete(level);
                break;
              }
            }
          } else if (order.side === 'SELL') {
            for (const [level, o] of this.openSellOrders.entries()) {
              if (o.orderId === order.orderId) {
                this.openSellOrders.delete(level);
                break;
              }
            }
          }
        } catch (err) {
          this.logMessages.logError(`Error canceling order ID ${order.orderId}:`, err);
        }
      }
    } catch (err) {
      this.logMessages.logError('Error fetching or canceling orders:', err);
    }
  }

  getProfitLoss() {
    return this.profitLoss;
  }
}
