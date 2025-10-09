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
export class GridBuyMarginStrategy implements TradingStrategy {
  id: string;
  symbol: string;
  config: {
    gridCount: number;
    totalQuantity: number;
    profitMargin: number;       // Ejemplo 0.01 para 1%
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number;   // Margen de seguridad para compra (ej. 0.001 = 0.1%)
  };

  private readonly logger = new Logger(GridBuyMarginStrategy.name);
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private isRunning = true;

  private profitLoss = 0; // Variable para acumulación de ganancia/pérdida

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logInfo(`Starting Grid BUY on ${this.symbol} with config: ${JSON.stringify(this.config)}`);

    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) throw new Error(`Filters not found for ${this.symbol}`);

    await this.cancelExistingOrdersInRange(0, Number.MAX_VALUE);

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        // Ordenes de compra se colocan por debajo del precio actual
        const lowerPrice = currentPrice * (1 - this.config.profitMargin * this.config.gridCount);
        const upperPrice = currentPrice;
        await this.placeBuyOrders(lowerPrice, upperPrice, priceFilter, lotSizeFilter, currentPrice);

        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);

        const sleepDuration = this.calculateSleepDuration();
        this.logInfo(`Sleeping ${sleepDuration} ms`);
        await this.sleep(sleepDuration);
      } catch (err) {
        this.logError('Error in monitoring loop:', err);
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
      const allOrders = await this.binanceService.getAllCrossMarginOrders(this.symbol, 500);
      for (const o of allOrders) {
        const status = o.status;
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(status)) continue;
        const p = Number(o.price);
        if (!Number.isFinite(p)) continue;
        if (o.side === 'BUY' && p >= lowerPrice && p <= upperPrice) {
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, o.orderId);
            this.logWarn(`ALERTA: Orden de COMPRA abierta cancelada ID ${o.orderId} precio ${o.price} dentro del rango [${lowerPrice}, ${upperPrice}]`);
          } catch (err) {
            this.logError(`Error al cancelar orden ID ${o.orderId}:`, err);
          }
        }
      }
    } catch (err) {
      this.logError('Error obteniendo/cancelando órdenes existentes:', err);
    }
  }

  private async placeBuyOrders(
    lowerPrice: number,
    upperPrice: number,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;
    let qtySum = 0;

    for (let i = 0; i <= this.config.gridCount; i++) {
      if (this.openBuyOrders.has(i)) continue;

      const buyPriceRaw = lowerPrice + i * gridStep;
      if (buyPriceRaw >= currentPrice) {
        // Omitir niveles por encima del precio actual
        continue;
      }

      const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);

      let quantity = this.config.totalQuantity / this.config.gridCount;
      quantity = Math.min(quantity, this.config.totalQuantity - qtySum);
      qtySum += quantity;
      const adjQuantity = this.roundToStep(quantity, lotSizeFilter.stepSize);

      this.logInfo(`Placing LIMIT BUY order level ${i}, price ${buyPrice}, quantity ${adjQuantity}`);

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'BUY',
          adjQuantity.toString(),
          buyPrice.toString(),
          'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price ?? buyPrice),
          origQty: String(order.origQty ?? adjQuantity),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logSuccess(`BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logError(`Error creating BUY order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private async checkBuyOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

        if (statusData.status === 'FILLED') {
          this.logSuccess(`Order BUY level ${i} completed ID: ${order.orderId}`);
          this.openBuyOrders.delete(i);

          // Colocar orden de venta contraparte por encima del precio de compra
          const buyPrice = parseFloat(order.price);
          const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);
          const sellPriceRaw = buyPrice * (1 + this.config.profitMargin);
          const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);

          this.logInfo(`Placing LIMIT SELL order contraparte at price ${sellPrice}, quantity ${quantity}`);

          try {
            const sellOrder = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol,
              'SELL',
              quantity.toString(),
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
            this.openSellOrders.set(i, normalizedSell);
            this.logSuccess(`SELL order created ID: ${normalizedSell.orderId} at level ${i}`);
          } catch (err) {
            this.logError(`Error creating SELL order level ${i}:`, err);
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(`BUY order ID ${order.orderId} level ${i} stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openBuyOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logError(`Error canceling stuck BUY order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logError(`Error checking BUY order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertBuyOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  private async reinsertBuyOrders(levels: number[], priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const lowerPrice = currentPrice * (1 - this.config.profitMargin * this.config.gridCount);
    const upperPrice = currentPrice;

    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      const buyPriceRaw = lowerPrice + i * gridStep;
      const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
      const quantity = this.roundToStep(this.config.totalQuantity / this.config.gridCount, lotSizeFilter.stepSize);

      this.logInfo(`Reinserting LIMIT BUY order level ${i}, price ${buyPrice}, quantity ${quantity}`);

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
          price: String(order.price),
          origQty: String(order.origQty),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logSuccess(`Reinserted BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logError(`Error reinserting BUY order at level ${i}:`, err);
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
}
