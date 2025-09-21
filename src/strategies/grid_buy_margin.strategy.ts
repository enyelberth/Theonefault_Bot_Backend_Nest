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

  private readonly logger = new Logger(GridBuyMarginStrategy.name);
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private isRunning = true;
  private skippedLevels = new Set<number>(); // niveles omitidos porque precio < nivel

  private profitLoss = 0; // Variable para acumulación de ganancia/pérdida

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logInfo(`Starting Grid Buy on ${this.symbol} with config: ${JSON.stringify(this.config)}`);

    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) throw new Error(`Filters not found for ${this.symbol}`);

    if (this.config.lowerPrice === undefined || this.config.upperPrice === undefined) {
      throw new Error('Debe definir lowerPrice y upperPrice en la configuración para usar grillas fijas.');
    }

    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    await this.cancelExistingOrdersInRange(lowerPrice, upperPrice);
    await this.placeBuyOrders(lowerPrice, gridStep, priceFilter, lotSizeFilter, await this.getCurrentPrice());

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        await this.tryPlaceSkippedLevels(currentPrice, priceFilter, lotSizeFilter);

        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);

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
        if (p >= lowerPrice && p <= upperPrice) {
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, o.orderId);
            this.logWarn(`ALERTA: Orden abierta cancelada ID ${o.orderId} precio ${o.price} dentro del rango [${lowerPrice}, ${upperPrice}]`);
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
    gridStep: number,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const totalQty = this.config.totalQuantity;
    const safety = this.config.buySafetyMargin ?? 0.0005;
    const safeThreshold = currentPrice * (1 - safety);
    let qtySum = 0;

    for (let i = 0; i <= this.config.gridCount; i++) {
      if (this.openBuyOrders.has(i)) continue;

      const buyPriceRaw = lowerPrice + i * gridStep;
      let buyPriceNum = this.roundToStep(buyPriceRaw, priceFilter.tickSize);

      if (buyPriceNum >= safeThreshold || buyPriceNum >= currentPrice) {
        this.logWarn(`ALERTA: Nivel ${i} (${buyPriceNum}) >= umbral seguro ${safeThreshold.toFixed(8)} o >= precio actual ${currentPrice} -> se omite colocación`);
        this.skippedLevels.add(i);
        continue;
      } else {
        if (this.skippedLevels.has(i)) this.skippedLevels.delete(i);
      }

      const distanceFactor = 1 - Math.abs(buyPriceRaw - currentPrice) / (gridStep * this.config.gridCount);
      let quantity = (totalQty / this.config.gridCount) * (0.5 + distanceFactor / 2);
      quantity = Math.min(quantity, totalQty - qtySum);
      qtySum += quantity;
      const adjQuantity = this.roundToStep(quantity, lotSizeFilter.stepSize);

      // Garantizar que placePrice no supere safeThreshold y sea múltiplo de tickSize
      let placePriceNum = Math.min(buyPriceNum, safeThreshold - parseFloat(priceFilter.tickSize));
      placePriceNum = this.roundToStep(placePriceNum, priceFilter.tickSize);

      this.logInfo(`Placing LIMIT BUY order level ${i}, price ${placePriceNum} (nivel raw ${buyPriceRaw.toFixed(8)}), quantity ${adjQuantity}`);

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(this.symbol, 'BUY', adjQuantity.toString(), placePriceNum.toString(), 'GTC');
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price ?? placePriceNum),
          origQty: String(order.origQty ?? adjQuantity),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logSuccess(`BUY order created ID: ${normalizedOrder.orderId} at level ${i} price ${placePriceNum}`);
      } catch (error) {
        this.logError(`Error creating BUY order at level ${i}:`, error);
      }

      await this.sleep(250);
    }
  }

  private async tryPlaceSkippedLevels(currentPrice: number, priceFilter: any, lotSizeFilter: any) {
    if (this.skippedLevels.size === 0) return;
    const safety = this.config.buySafetyMargin ?? 0.0008;
    const safeThreshold = currentPrice * (1 - safety);
    const levels = Array.from(this.skippedLevels).sort((a, b) => a - b);
    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      if (this.openBuyOrders.has(i)) {
        this.skippedLevels.delete(i);
        continue;
      }
      const buyPriceRaw = lowerPrice + i * gridStep;
      const buyPriceNum = this.roundToStep(buyPriceRaw, priceFilter.tickSize);

      if (buyPriceNum < safeThreshold && buyPriceNum < currentPrice) {
        let placePriceNum = Math.min(buyPriceNum, safeThreshold - parseFloat(priceFilter.tickSize));
        placePriceNum = this.roundToStep(placePriceNum, priceFilter.tickSize);
        this.logInfo(`ALERTA: Precio subió a ${currentPrice} — intentando colocar nivel ${i} a ${placePriceNum} (nivel raw ${buyPriceRaw.toFixed(8)})`);
        try {
          const quantity = this.roundToStep(this.config.totalQuantity / this.config.gridCount, lotSizeFilter.stepSize);
          const order = await this.binanceService.createCrossMarginLimitOrder(this.symbol, 'BUY', quantity.toString(), placePriceNum.toString(), 'GTC');
          const normalizedOrder: Order = {
            orderId: Number(order.orderId),
            price: String(order.price ?? placePriceNum),
            origQty: String(order.origQty ?? quantity),
            timestamp: Date.now(),
          };
          this.openBuyOrders.set(i, normalizedOrder);
          this.skippedLevels.delete(i);
          this.logSuccess(`BUY order (skipped->placed) created ID: ${normalizedOrder.orderId} at level ${i} price ${placePriceNum}`);
        } catch (err) {
          this.logError(`Error creating BUY order for skipped level ${i}:`, err);
        }
        await this.sleep(250);
      } else {
        this.logInfo(`Nivel ${i} sigue omitido: nivel ${buyPriceNum} >= umbral seguro ${safeThreshold.toFixed(8)} o >= precio actual ${currentPrice}`);
      }
    }
  }

  private async checkBuyOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const stopLossMargin = this.config.stopLossMargin ?? 0.02;

    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

        if (statusData.status === 'FILLED') {
          this.logSuccess(`Order BUY level ${i} completed ID: ${order.orderId}`);
          this.openBuyOrders.delete(i);

          const buyPrice = parseFloat(order.price);
          const quantityRaw = parseFloat(order.origQty);
          const sellPriceRaw = buyPrice * (1 + this.config.profitMargin);
          const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);

          // Actualizar ganancia/pérdida estimada
          const estimatedProfit = (sellPriceRaw - buyPrice) * quantityRaw;
          this.profitLoss += estimatedProfit;
          this.logInfo(`Ganancia/Pérdida estimada actualizada: ${this.profitLoss.toFixed(8)}`);

          // Intentar crear orden de venta con manejo robusto
          try {
            const sellOrder = await this.binanceService.createCrossMarginLimitOrder(
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
            this.openSellOrders.set(i, normalizedSell);
            this.logSuccess(`SELL order created ID: ${normalizedSell.orderId} at level ${i} with price ${sellPrice}`);
          } catch (err) {
            this.logError(`Error creating SELL order level ${i}:`, err);
          }

          if (stopLossMargin > 0) {
            const stopLossPriceRaw = buyPrice * (1 - stopLossMargin);
            const stopLossPrice = this.roundToStep(stopLossPriceRaw, priceFilter.tickSize);
            try {
              await this.binanceService.createCrossMarginStopLossOrder(this.symbol, 'SELL', quantityRaw.toString(), stopLossPrice.toString());
              this.logInfo(`Stop Loss order created at ${stopLossPrice} for level ${i}`);
            } catch (err) {
              this.logError(`Error creating Stop Loss order level ${i}:`, err);
            }
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(`Order ID ${order.orderId} level ${i} is stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openBuyOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logError(`Error canceling stuck order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logError(`Error checking BUY order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  // Nuevo método para chequear órdenes de venta con lógica similar a buy
  private async checkSellOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openSellOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

        if (statusData.status === 'FILLED') {
          this.logSuccess(`Order SELL level ${i} completed ID: ${order.orderId}`);
          this.openSellOrders.delete(i);
          // Podrías agregar lógica posterior para esta venta si es necesario
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(`SELL order ID ${order.orderId} level ${i} stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openSellOrders.delete(i);
            // Opcional: reinsertar órdenes de compra o manejar según diseño
          } catch (e) {
            this.logError(`Error canceling stuck SELL order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logError(`Error checking SELL order status ID ${order.orderId}:`, err);
      }
    }
  }

  private async reinsertOrders(
    levels: number[],
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      let buyPriceRaw = lowerPrice + i * gridStep;
      buyPriceRaw *= 0.9995;
      const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
      const quantity = this.roundToStep(this.config.totalQuantity / this.config.gridCount, lotSizeFilter.stepSize);

      this.logInfo(`Reinserting LIMIT BUY order level ${i}, price ${buyPrice}, quantity ${quantity}`);

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(this.symbol, 'BUY', quantity.toString(), buyPrice.toString(), 'GTC');
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

  // Mejora en función para ajustes numéricos al step con precisión decimal exacta y redondeo hacia abajo para evitar errores
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
