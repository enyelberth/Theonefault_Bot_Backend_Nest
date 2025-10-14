import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';
import { LoggerMessages } from 'src/utils/logs';

interface Order {
  orderId: number;
  price: string;
  origQty: string;
  timestamp: number;
  isSell?: boolean;
}

interface OrderLevel {
  id: number;
  price: number;
  quantity: number;
}

@Injectable()
export class GridSellMarginFixedStrategy implements TradingStrategy {
  id: string;
  symbol: string;
  config: {
    ordersLevels: OrderLevel[];
    gridCount: number;
    totalQuantity: number;
    profitMargin: number;
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number; // Porcentaje (ej. 0.001 = 0.1%)
  };

  private readonly loggerMessages = new Logger(GridSellMarginFixedStrategy.name);
  private readonly logger = new LoggerMessages(this.loggerMessages);
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private stoppedLossLevels = new Set<number>();
  private isRunning = true;
  private profitLoss = 0;


  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logger.logInfo(`Starting Grid Sell FIXED on ${this.symbol}`);
    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter)
      throw new Error(`Filters not found for ${this.symbol}`);

    await this.cancelExistingOrdersInRange();

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        await this.placeSellOrders(priceFilter, lotSizeFilter, currentPrice);

        await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);

        const sleepDuration = this.calculateSleepDuration();
        this.logger.logInfo(`Sleeping ${sleepDuration} ms`);
        await this.sleep(sleepDuration);
      } catch (err) {
        this.logger.logError('Error in monitoring loop:', err);
        await this.exponentialBackoff(30000, 5);
      }
    }
  }

  private async getCurrentPrice(): Promise<number> {
    const resp = await this.binanceService.getSymbolPrice(this.symbol);
    return parseFloat(resp.price);
  }

  private async cancelExistingOrdersInRange() {
    try {
      const allOrders = await this.binanceService.getAllCrossMarginOrders(this.symbol, 500);

      if (!this.config.ordersLevels || this.config.ordersLevels.length === 0) {
        this.logger.logWarn('No levels defined in config.ordersLevels for cancellation range.');
        return;
      }
      const prices = this.config.ordersLevels.map(level => level.price);
      const lowerPrice = Math.min(...prices);
      const upperPrice = Math.max(...prices);

      const activeSellOrdersInRange = allOrders.filter(o => {
        if (o.side !== 'SELL') return false;
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(o.status)) return false;
        const priceNum = Number(o.price);
        if (!Number.isFinite(priceNum)) return false;
        return priceNum >= lowerPrice && priceNum <= upperPrice;
      });

      if (activeSellOrdersInRange.length === 0) {
        this.logger.logInfo('No active SELL orders in range.');
        return;
      }

      this.logger.logInfo(`Canceling orders in range [${lowerPrice}, ${upperPrice}]`);

      for (const o of activeSellOrdersInRange) {
        try {
          await this.binanceService.cancelCrossMarginOrder(this.symbol, o.orderId);
          this.logger.logWarn(`Canceled SELL order ID ${o.orderId} price ${o.price}`);
        } catch (err) {
          this.logger.logError(`Error canceling order ID ${o.orderId}:`, err);
        }
      }
    } catch (err) {
      this.logger.logError('Error fetching or canceling orders:', err);
    }
  }

  private async placeSellOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const minTick = parseFloat(priceFilter.tickSize);
    const minPriceGap = minTick * 2;

    for (let i = 0; i < this.config.ordersLevels.length; i++) {
      if (this.openSellOrders.has(i)) continue;
      if (this.stoppedLossLevels.has(i)) {
        this.logger.logInfo(`Skipping level ${i} due to previous stop loss execution.`);
        continue;
      }

      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      let sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (sellPrice <= currentPrice) continue;

      let stopPrice = this.roundToStep(sellPrice * (1 - (this.config.stopLossMargin ?? 0.01)), priceFilter.tickSize);
      let stopLimitPrice = this.roundToStep(stopPrice * 0.995, priceFilter.tickSize);

      if ((sellPrice - stopPrice) < minPriceGap) {
        stopPrice = sellPrice - minPriceGap;
        stopPrice = this.roundToStep(stopPrice, priceFilter.tickSize);
        stopLimitPrice = this.roundToStep(stopPrice * 0.995, priceFilter.tickSize);
      }

      if (!(stopLimitPrice < stopPrice && stopPrice < sellPrice)) {
        this.logger.logError(`Invalid OCO price relation: sellPrice=${sellPrice}, stopPrice=${stopPrice}, stopLimitPrice=${stopLimitPrice}`);
        continue;
      }

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logger.logInfo(`Placing OCO SELL order level ${i}, price ${sellPrice}, stopPrice ${stopPrice}, stopLimitPrice ${stopLimitPrice}, quantity ${quantity}`);

      try {
        const order = await this.binanceService.createOcoOrder(
          this.symbol,
          'SELL',
          quantity.toString(),
          sellPrice.toString(),
          stopPrice.toString(),
          stopLimitPrice.toString(),
          'GTC',
        );

        const normalizedOrder: Order = {
          orderId: Number(order.orderListId),
          price: String(sellPrice),
          origQty: String(quantity),
          timestamp: Date.now(),
          isSell: true,
        };

        this.openSellOrders.set(i, normalizedOrder);
        this.logger.logSuccess(`OCO SELL order created ListID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logger.logError(`Error creating OCO SELL order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private async checkSellOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openSellOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

        if (statusData.status === 'FILLED') {
          this.logger.logSuccess(`Order SELL level ${i} completed ID: ${order.orderId}`);
          this.openSellOrders.delete(i);

          const filledPrice = parseFloat(statusData.avgPrice || '0');
          const orderLevel = this.config.ordersLevels[i];
          const stopLossThreshold = orderLevel.price * (1 - (this.config.stopLossMargin ?? 0.01));

          if (filledPrice <= stopLossThreshold) {
            this.logger.logWarn(`Level ${i} executed in stop loss at price ${filledPrice}, will not replace.`);
            this.stoppedLossLevels.add(i);
            continue;
          }

          const baseCost = orderLevel.price / (1 + this.config.profitMargin * this.config.gridCount);
          const quantity = orderLevel.quantity;
          const profit = (filledPrice - baseCost) * quantity;

          this.profitLoss += profit;
          this.logger.logInfo(`Profit/loss updated by ${profit} at level ${i}, total: ${this.profitLoss}`);

          const buyPriceRaw = filledPrice * (1 - (this.config.buySafetyMargin ?? 0.001));
          const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
          const qtyAdj = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);

          this.logger.logInfo(`Placing BUY order counterpart level ${i}, price ${buyPrice}, quantity ${qtyAdj}`);

          try {
            const buyOrder = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol,
              'BUY',
              qtyAdj.toString(),
              buyPrice.toString(),
              'GTC',
            );
            const normalizedBuyOrder: Order = {
              orderId: Number(buyOrder.orderId),
              price: String(buyOrder.price),
              origQty: String(buyOrder.origQty),
              timestamp: Date.now(),
            };
            this.openBuyOrders.set(i, normalizedBuyOrder);
            this.logger.logSuccess(`BUY order counterpart created ID: ${normalizedBuyOrder.orderId} at level ${i}`);
          } catch (err) {
            this.logger.logError(`Error creating BUY order counterpart at level ${i}:`, err);
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logger.logWarn(`SELL order ID ${order.orderId} level ${i} stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openSellOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logger.logError(`Error canceling stuck SELL order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logger.logError(`Error checking SELL order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertSellOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  private async reinsertSellOrders(levels: number[], priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    for (const i of levels) {
      if (this.stoppedLossLevels.has(i)) {
        this.logger.logInfo(`Skipping reinsertion at level ${i} due to previous stop loss.`);
        continue;
      }

      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      const sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (sellPrice <= currentPrice) continue;

      const stopPrice = this.roundToStep(sellPrice * (1 - (this.config.stopLossMargin ?? 0.01)), priceFilter.tickSize);
      const stopLimitPrice = this.roundToStep(stopPrice * 0.995, priceFilter.tickSize);
      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logger.logInfo(`Reinserting OCO SELL order level ${i}, price ${sellPrice}, stopPrice ${stopPrice}, stopLimitPrice ${stopLimitPrice}, quantity ${quantity}`);

      try {
        const order = await this.binanceService.createOcoOrder(
          this.symbol,
          'SELL',
          quantity.toString(),
          sellPrice.toString(),
          stopPrice.toString(),
          stopLimitPrice.toString(),
          'GTC',
        );

        const normalizedOrder: Order = {
          orderId: Number(order.orderListId),
          price: String(sellPrice),
          origQty: String(quantity),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logger.logSuccess(`Reinserted OCO SELL order created ListID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logger.logError(`Error reinserting OCO SELL order at level ${i}:`, err);
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

  private sleep(ms: number) {
    return new Promise(res => setTimeout(res, ms));
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
      this.logger.logInfo(`Retrying in ${waitTime} ms...`);
      await this.sleep(waitTime);
    }
  }

  getProfitLoss() {
    return this.profitLoss;
  }
}
