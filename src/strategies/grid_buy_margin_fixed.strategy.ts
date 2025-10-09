import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';
import { LoggerMessages } from 'src/utils/logs';
import { Order, OrderLevel } from 'src/interfaces/order';

@Injectable()
export class GridBuyMarginFixedStrategy implements TradingStrategy {
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

  private readonly loggerMessages = new Logger(GridBuyMarginFixedStrategy.name);
  private readonly logger = new LoggerMessages(this.loggerMessages);
  private stoppedLossLevels = new Set<number>();

  // Control órdenes abiertas por nivel índice
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private isRunning = true;
  private profitLoss = 0;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logger.logInfo(`Starting Grid BUY FIXED on ${this.symbol}`);
    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter)
      throw new Error(`Filters not found for ${this.symbol}`);

    await this.cancelExistingOrdersInRange();

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();
        this.logger.logInfo(`Current price: ${currentPrice}`);

        await this.placeBuyOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);
     //   await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);

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

      const activeBuyOrdersInRange = allOrders.filter(o => {
        if (o.side !== 'BUY') return false;
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(o.status)) return false;
        const priceNum = Number(o.price);
        if (!Number.isFinite(priceNum)) return false;
        return priceNum >= lowerPrice && priceNum <= upperPrice;
      });

      if (activeBuyOrdersInRange.length === 0) {
        this.logger.logInfo('No active BUY orders in range.');
        return;
      }

      this.logger.logInfo(`Canceling orders in range [${lowerPrice}, ${upperPrice}]`);

      for (const o of activeBuyOrdersInRange) {
        try {
          await this.binanceService.cancelCrossMarginOrder(this.symbol, o.orderId);
          this.logger.logWarn(`Canceled BUY order ID ${o.orderId} price ${o.price}`);
        } catch (err) {
          this.logger.logError(`Error canceling order ID ${o.orderId}:`, err);
        }
      }
    } catch (err) {
      this.logger.logError('Error fetching or canceling orders:', err);
    }
  }



  private async placeBuyOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    for (let i = 0; i < this.config.ordersLevels.length; i++) {
      if (this.openBuyOrders.has(i)) continue;
      if (this.stoppedLossLevels.has(i)) {
        this.logger.logInfo(`Skipping level ${i} due to previous stop loss.`);
        continue;
      }

      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      let buyPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      if (buyPrice >= currentPrice) continue; // solo comprar si precio menor actual

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);
      this.logger.logInfo(`Placing LIMIT BUY order level ${i}, price ${buyPrice}, quantity ${quantity}`);

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'BUY',
          quantity.toString(),
          buyPrice.toString(),
          'GTC',
        );

        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: buyPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
        };

        this.openBuyOrders.set(i, normalizedOrder);
        this.logger.logSuccess(`LIMIT BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logger.logError(`Error creating LIMIT BUY order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private async checkBuyOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);
        if (statusData.status === 'FILLED') {
          this.logger.logSuccess(`Order BUY level ${i} filled ID: ${order.orderId}`);
          this.openBuyOrders.delete(i);

          const filledPrice = parseFloat(statusData.avgPrice ?? order.price);
          const orderLevel = this.config.ordersLevels[i];

          const sellPrice = this.roundToStep(orderLevel.price * (1 + this.config.profitMargin), priceFilter.tickSize);
          const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);

          this.logger.logInfo(`Placing LIMIT SELL order level ${i} at price ${sellPrice}`);

          try {
            const orderSell = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol,
              'SELL',
              quantity.toString(),
              sellPrice.toString(),
              'GTC'
            );

            const normalizedSellOrder: Order = {
              orderId: Number(orderSell.orderId),
              price: sellPrice.toString(),
              origQty: quantity.toString(),
              timestamp: Date.now(),
              isSell: true,
            };

            this.openSellOrders.set(i, normalizedSellOrder);
            this.logger.logSuccess(`LIMIT SELL order created ID: ${normalizedSellOrder.orderId} at level ${i}`);
          } catch (err) {
            this.logger.logError(`Error creating LIMIT SELL order at level ${i}:`, err);
          }
        }
      } catch (err) {
        this.logger.logError(`Error checking BUY order status ID ${order.orderId}:`, err);
      }
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

          const filledPrice = parseFloat(statusData.avgPrice ?? '0');
          const orderLevel = this.config.ordersLevels[i];
          const stopLossThreshold = orderLevel.price * (1 - (this.config.stopLossMargin ?? 0.01));

          if (filledPrice <= stopLossThreshold) {
            this.logger.logWarn(`Level ${i} hit stop loss at price ${filledPrice}, will not replace.`);
            this.stoppedLossLevels.add(i);
            continue;
          }

          const baseCost = orderLevel.price / (1 + this.config.profitMargin * this.config.gridCount);
          const quantity = orderLevel.quantity;
          const profit = (filledPrice - baseCost) * quantity;

          this.profitLoss += profit;
          this.logger.logInfo(`Profit/loss updated by ${profit} at level ${i}, total: ${this.profitLoss}`);
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

      this.logger.logInfo(`Attempting to reinsert LIMIT SELL order level ${i}: sellPrice=${sellPrice}, currentPrice=${currentPrice}`);

      if (sellPrice <= currentPrice) {
        this.logger.logInfo(`Skipping reinsertion at level ${i} because sellPrice <= currentPrice`);
        continue;
      }

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);

      this.logger.logInfo(`Reinserting LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${quantity}`);

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'SELL',
          quantity.toString(),
          sellPrice.toString(),
          'GTC'
        );

        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(sellPrice),
          origQty: String(quantity),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logger.logSuccess(`Reinserted LIMIT SELL order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logger.logError(`Error reinserting LIMIT SELL order at level ${i}:`, err);
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
      const waitTime = baseDelayMs * 2 ** attempt;
      this.logger.logInfo(`Retrying in ${waitTime} ms...`);
      await this.sleep(waitTime);
    }
  }
}
