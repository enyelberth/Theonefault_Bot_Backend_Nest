import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

interface Order {
  orderId: number;
  price: string;
  origQty: string;
  timestamp: number;
  isSell?: boolean;
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgRed: '\x1b[31m',
  fgCyan: '\x1b[36m',
  fgMagenta: '\x1b[35m',
};

@Injectable()
export class GridFullStrategy implements TradingStrategy {
  id?: number;
  symbol: string;
  config: {
    trading: boolean; // true = GRID BUY, false = GRID SELL
    gridCount: number;
    lowerPrice: number;
    upperPrice: number;
    totalQuantity: number;
    profitMargin: number;
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number; // Porcentaje (ej. 0.001 = 0.1%)
  };

  private readonly logger = new Logger(GridFullStrategy.name);
  private isRunning = true;
  private trading: boolean;
  private openOrders = new Map<number, Order>();
  private skippedLevels = new Set<number>();
  private profitLoss = 0;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.trading = this.config.trading ?? true;
    this.logSuccess(`Starting GridFullStrategy for ${this.symbol} trading=${this.trading}`);

    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) throw new Error(`Filters not found for ${this.symbol}`);

    if (this.config.lowerPrice === undefined || this.config.upperPrice === undefined) {
      throw new Error("Config must define lowerPrice and upperPrice");
    }


    await this.cancelExistingOrdersInRange(this.config.lowerPrice, this.config.upperPrice);

    const priceRange = this.config.upperPrice - this.config.lowerPrice;
    const gridStep = priceRange / this.config.gridCount;

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        await this.tryPlaceSkippedLevels(currentPrice, priceFilter, lotSizeFilter);

        await this.checkOrders(priceFilter, lotSizeFilter, currentPrice);

        await this.placeGridOrders(this.config.lowerPrice, this.config.upperPrice, gridStep, priceFilter, lotSizeFilter, currentPrice);

        const sleepDuration = this.calculateSleepDuration();
        this.logInfo(`Sleeping ${sleepDuration} ms`);
        await this.sleep(sleepDuration);
        
      } catch (error) {
        this.logError('Error in monitoring loop:', error);
        await this.exponentialBackoff(30000, 5);
      }
    }
  }

  private async getCurrentPrice(): Promise<number> {
    const resp = await this.binanceService.getSymbolPrice(this.symbol);
    return parseFloat(resp.price);
  }

  private async cancelExistingOrdersInRange(lowerPrice: number, upperPrice: number) {
    try {
      const allOrders = await this.binanceService.getAllOrders(this.symbol, 500);
      for (const order of allOrders) {
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(order.status)) continue;
        const price = Number(order.price);
        if (!Number.isFinite(price)) continue;
        if (price >= lowerPrice && price <= upperPrice) {
          try {
            await this.binanceService.cancelOrder(this.symbol, order.orderId);
            this.logWarn(`Cancelled open order ID ${order.orderId} at price ${order.price} within range [${lowerPrice}, ${upperPrice}]`);
          } catch (err) {
            this.logError(`Error cancelling order ID ${order.orderId}:`, err);
          }
        }
      }
    } catch (err) {
      this.logError('Error fetching/cancelling existing orders:', err);
    }
  }

  private async placeGridOrders(
    lowerPrice: number,
    upperPrice: number,
    gridStep: number,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const totalQty = this.config.totalQuantity;
    const safety = this.config.buySafetyMargin ?? 0.0004;
    const safeThreshold = this.trading ? currentPrice * (1 - safety) : currentPrice * (1 + safety);

    let qtySum = 0;

    for (let i = 0; i <= this.config.gridCount; i++) {
      if (this.openOrders.has(i)) continue;

      let levelPriceRaw = this.trading ? lowerPrice + i * gridStep : upperPrice - i * gridStep;
      const levelPriceStr = this.ajustarAlStep(levelPriceRaw, priceFilter.tickSize);
      const levelPriceNum = Number(levelPriceStr);

      if ((this.trading && (levelPriceNum >= safeThreshold || levelPriceNum >= currentPrice)) ||
          (!this.trading && (levelPriceNum <= safeThreshold || levelPriceNum <= currentPrice))) {
        this.logWarn(`Skipping level ${i} at price ${levelPriceStr} due to safety or price threshold.`);
        this.skippedLevels.add(i);
        continue;
      }
      this.skippedLevels.delete(i);

      const distanceFactor = 1 - Math.abs(levelPriceRaw - currentPrice) / (gridStep * this.config.gridCount);
      let quantity = (totalQty / this.config.gridCount) * (0.5 + distanceFactor / 2);
      quantity = Math.min(quantity, totalQty - qtySum);
      qtySum += quantity;
      const adjQuantity = this.ajustarAlStep(quantity, lotSizeFilter.stepSize);

      const placePriceNum = this.trading ?
          Math.min(levelPriceNum, safeThreshold - parseFloat(priceFilter.tickSize)) :
          Math.max(levelPriceNum, safeThreshold + parseFloat(priceFilter.tickSize));
      const placePriceStr = this.ajustarAlStep(placePriceNum, priceFilter.tickSize);

      const side = this.trading ? 'BUY' : 'SELL';
      this.logInfo(`Placing ${side} limit order level ${i}, price ${placePriceStr}, quantity ${adjQuantity}`);

      try {
        const order = await this.binanceService.createLimitOrder(this.symbol, side, adjQuantity.toString(), placePriceStr, 'GTC');
        if (!order || !order.orderId) {
          this.logWarn(`No order created for level ${i}, response: ${JSON.stringify(order)}`);
          continue;
        }
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price || placePriceStr),
          origQty: String(order.origQty || adjQuantity),
          timestamp: Date.now(),
        };
        this.openOrders.set(i, normalizedOrder);
        this.logSuccess(`${side} order created ID: ${normalizedOrder.orderId} at level ${i} price ${placePriceStr}`);
      } catch (err) {
        this.logError(`Error creating ${side} order at level ${i}:`, err);
      }
      await this.sleep(250);
    }
  }

  private async tryPlaceSkippedLevels(currentPrice: number, priceFilter: any, lotSizeFilter: any) {
    if (this.skippedLevels.size === 0) return;
    const safety = this.config.buySafetyMargin ?? 0.0008;
    const safeThreshold = this.trading ? currentPrice * (1 - safety) : currentPrice * (1 + safety);
    const levels = Array.from(this.skippedLevels).sort((a, b) => a - b);
    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      if (this.openOrders.has(i)) {
        this.skippedLevels.delete(i);
        continue;
      }
      let levelPriceRaw = this.trading ? lowerPrice + i * gridStep : upperPrice - i * gridStep;
      const levelPriceNum = Number(this.ajustarAlStep(levelPriceRaw, priceFilter.tickSize));

      if ((this.trading && levelPriceNum < safeThreshold && levelPriceNum < currentPrice) ||
          (!this.trading && levelPriceNum > safeThreshold && levelPriceNum > currentPrice)) {
        const placePriceNum = this.trading ?
            Math.min(levelPriceNum, safeThreshold - parseFloat(priceFilter.tickSize)) :
            Math.max(levelPriceNum, safeThreshold + parseFloat(priceFilter.tickSize));
        const placePriceStr = this.ajustarAlStep(placePriceNum, priceFilter.tickSize);
        this.logInfo(`Trying skipped level ${i} at price ${placePriceStr}`);

        try {
          const quantity = this.ajustarAlStep(this.config.totalQuantity / this.config.gridCount, lotSizeFilter.stepSize);
          const side = this.trading ? 'BUY' : 'SELL';
          const order = await this.binanceService.createLimitOrder(this.symbol, side, quantity.toString(), placePriceStr, 'GTC');
          if (!order || !order.orderId) {
            this.logWarn(`No order created for skipped level ${i}, response: ${JSON.stringify(order)}`);
            continue;
          }
          const normalizedOrder: Order = {
            orderId: Number(order.orderId),
            price: String(order.price || placePriceStr),
            origQty: String(order.origQty || quantity),
            timestamp: Date.now(),
          };
          this.openOrders.set(i, normalizedOrder);
          this.skippedLevels.delete(i);
          this.logSuccess(`${side} order (skipped->placed) created ID: ${normalizedOrder.orderId} at level ${i} price ${placePriceStr}`);
        } catch (err) {
          this.logError(`Error creating order for skipped level ${i}:`, err);
        }
        await this.sleep(250);
      } else {
        this.logInfo(`Skipped level ${i} still omitted: price check failed.`);
      }
    }
  }

  private async checkOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs || 3600000;
    const stopLossMargin = this.config.stopLossMargin ?? 0.02;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of this.openOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkOrderStatus(this.symbol, order.orderId);
        if (statusData.status === 'FILLED') {
          const side = this.trading ? 'BUY' : 'SELL';
          this.logSuccess(`${side} order level ${i} filled, ID: ${order.orderId}`);
          this.openOrders.delete(i);

          if (this.trading) {
            const buyPrice = parseFloat(order.price);
            const quantityRaw = parseFloat(order.origQty);
            const sellPriceRaw = buyPrice * (1 + this.config.profitMargin);
            const sellPrice = this.ajustarAlStep(sellPriceRaw, priceFilter.tickSize);
            const estimatedProfit = (sellPriceRaw - buyPrice) * quantityRaw;
            this.profitLoss += estimatedProfit;
            this.logInfo(`Estimated Profit/Loss updated: ${this.profitLoss.toFixed(8)}`);

            try {
              const sellOrder = await this.binanceService.createLimitOrder(
                this.symbol,
                'SELL',
                quantityRaw.toString(),
                sellPrice.toString(),
                'GTC',
              );
              const normalizedSell: Order = {
                orderId: Number(sellOrder.orderId),
                price: String(sellOrder.price),
                origQty: String(sellOrder.origQty),
                timestamp: Date.now(),
                isSell: true,
              };
              this.openOrders.set(i, normalizedSell);
              this.logSuccess(`SELL order created ID: ${normalizedSell.orderId} at level ${i} with price ${sellPrice}`);
            } catch (err) {
              this.logError(`Error creating SELL order level ${i}:`, err);
            }

            if (stopLossMargin > 0) {
              const stopLossPriceRaw = buyPrice * (1 - stopLossMargin);
              const stopLossPrice = this.ajustarAlStep(stopLossPriceRaw, priceFilter.tickSize);
              try {
                await this.binanceService.createStopLossOrder(this.symbol, 'SELL', quantityRaw.toString(), stopLossPrice.toString());
                this.logInfo(`Stop Loss order created at ${stopLossPrice} for level ${i}`);
              } catch (err) {
                this.logError(`Error creating Stop Loss order level ${i}:`, err);
              }
            }
          }

          // Puedes agregar lógica similar para grid sell si es necesario
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(`Order ID ${order.orderId} level ${i} is stuck, canceling...`);
          try {
            await this.binanceService.cancelOrder(this.symbol, order.orderId);
            this.openOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logError(`Error canceling stuck order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logError(`Error checking order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  private async reinsertOrders(levels: number[], priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      let reinsertionPriceRaw = this.trading ? lowerPrice + i * gridStep : upperPrice - i * gridStep * 0.9995;
      const reinsertionPrice = this.ajustarAlStep(reinsertionPriceRaw, priceFilter.tickSize);
      const quantity = this.ajustarAlStep(this.config.totalQuantity / this.config.gridCount, lotSizeFilter.stepSize);

      this.logInfo(`Reinserting ${this.trading ? 'BUY' : 'SELL'} order level ${i}, price ${reinsertionPrice}, quantity ${quantity}`);

      try {
        const order = await this.binanceService.createLimitOrder(this.symbol, this.trading ? 'BUY' : 'SELL', quantity.toString(), reinsertionPrice.toString(), 'GTC');
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price),
          origQty: String(order.origQty),
          timestamp: Date.now(),
        };
        this.openOrders.set(i, normalizedOrder);
        this.logSuccess(`Reinserted ${this.trading ? 'BUY' : 'SELL'} order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logError(`Error reinserting order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private ajustarAlStep(value: number, step: string): string {
    const stepFloat = parseFloat(step);
    const precision = (step.split('.')[1] || '').length;
    const adjusted = Math.round(value / stepFloat) * stepFloat;
    return adjusted.toFixed(precision);
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
      this.logInfo(`Retrying in ${waitTime} ms...`);
      await this.sleep(waitTime);
    }
  }

  private logSuccess(message: string, ...args: any[]) {
    this.logger.log(`${COLORS.fgGreen}${message}${COLORS.reset}`, ...args);
  }

  private logInfo(message: string, ...args: any[]) {
    this.logger.log(`${COLORS.fgCyan}${message}${COLORS.reset}`, ...args);
  }

  private logWarn(message: string, ...args: any[]) {
    this.logger.warn(`${COLORS.fgYellow}ALERTA: ${message}${COLORS.reset}`, ...args);
  }

  private logError(message: string, ...args: any[]) {
    this.logger.error(`${COLORS.fgRed}${message}${COLORS.reset}`, ...args);
  }

  getProfitLoss() {
    return this.profitLoss;
  }
}
