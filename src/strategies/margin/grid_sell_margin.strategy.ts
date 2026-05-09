import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from '../trading-strategy.interface';
import { BinanceService } from '../../binance/binance.service';
import { StrategyRuntimeUtils } from '../shared/strategy-runtime.utils';

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
export class GridSellMarginStrategy implements TradingStrategy {
  id: string;
  symbol: string;
  config: {
    gridCount: number;
    totalQuantity: number;
    profitMargin: number;
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number; // Porcentaje (ej. 0.001 = 0.1%)
  };

  private readonly logger = new Logger(GridSellMarginStrategy.name);
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private isRunning = true;

  private profitLoss = 0; // Variable para acumulación de ganancia/pérdida

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logInfo(
      `Starting Grid Sell on ${this.symbol} with config: ${JSON.stringify(this.config)}`,
    );

    const { priceFilter, lotSizeFilter } =
      await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter)
      throw new Error(`Filters not found for ${this.symbol}`);

    await this.cancelExistingOrdersInRange(0, Number.MAX_VALUE);

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        const lowerPrice = currentPrice;
        const upperPrice =
          currentPrice * (1 + this.config.profitMargin * this.config.gridCount);
        await this.placeSellOrders(
          lowerPrice,
          upperPrice,
          priceFilter,
          lotSizeFilter,
          currentPrice,
        );

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

  private async cancelExistingOrdersInRange(
    lowerPrice: number,
    upperPrice: number,
  ) {
    try {
      const allOrders = await this.binanceService.getAllCrossMarginOrders(
        this.symbol,
        500,
      );
      for (const o of allOrders) {
        const status = o.status;
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(status))
          continue;
        const p = Number(o.price);
        if (!Number.isFinite(p)) continue;
        if (o.side === 'SELL' && p >= lowerPrice && p <= upperPrice) {
          try {
            await this.binanceService.cancelCrossMarginOrder(
              this.symbol,
              o.orderId,
            );
            this.logWarn(
              `ALERTA: Orden de VENTA abierta cancelada ID ${o.orderId} precio ${o.price} dentro del rango [${lowerPrice}, ${upperPrice}]`,
            );
          } catch (err) {
            this.logError(`Error al cancelar orden ID ${o.orderId}:`, err);
          }
        }
      }
    } catch (err) {
      this.logError('Error obteniendo/cancelando órdenes existentes:', err);
    }
  }

  private async placeSellOrders(
    lowerPrice: number,
    upperPrice: number,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;
    let qtySum = 0;

    for (let i = 0; i <= this.config.gridCount; i++) {
      if (this.openSellOrders.has(i)) continue;

      const sellPriceRaw = lowerPrice + i * gridStep;
      if (sellPriceRaw <= currentPrice) {
        // Omitir niveles por debajo del precio actual
        continue;
      }

      const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);

      let quantity = this.config.totalQuantity / this.config.gridCount;
      quantity = Math.min(quantity, this.config.totalQuantity - qtySum);
      qtySum += quantity;
      const adjQuantity = this.roundToStep(quantity, lotSizeFilter.stepSize);

      this.logInfo(
        `Placing LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${adjQuantity}`,
      );

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'SELL',
          adjQuantity.toString(),
          sellPrice.toString(),
          'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price ?? sellPrice),
          origQty: String(order.origQty ?? adjQuantity),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logSuccess(
          `SELL order created ID: ${normalizedOrder.orderId} at level ${i}`,
        );
      } catch (err) {
        this.logError(`Error creating SELL order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private async checkSellOrders(
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openSellOrders.entries())) {
      try {
        const statusData =
          await this.binanceService.checkCrossMarginOrderStatus(
            this.symbol,
            order.orderId,
          );

        if (statusData.status === 'FILLED') {
          this.logSuccess(
            `Order SELL level ${i} completed ID: ${order.orderId}`,
          );
          this.openSellOrders.delete(i);

          // Crear orden de compra contraparte
          const buyPriceRaw =
            parseFloat(order.price) *
            (1 - (this.config.buySafetyMargin ?? 0.001));
          const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
          const quantity = this.roundToStep(
            parseFloat(order.origQty),
            lotSizeFilter.stepSize,
          );

          this.logInfo(
            `Placing BUY order contraparte for completed SELL order level ${i}, price ${buyPrice}, quantity ${quantity}`,
          );

          try {
            const buyOrder =
              await this.binanceService.createCrossMarginLimitOrder(
                this.symbol,
                'BUY',
                quantity.toString(),
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
            this.logSuccess(
              `BUY order contraparte created ID: ${normalizedBuyOrder.orderId} at level ${i}`,
            );
          } catch (err) {
            this.logError(
              `Error creating BUY order contraparte at level ${i}:`,
              err,
            );
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(
            `SELL order ID ${order.orderId} level ${i} stuck, canceling...`,
          );
          try {
            await this.binanceService.cancelCrossMarginOrder(
              this.symbol,
              order.orderId,
            );
            this.openSellOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logError(
              `Error canceling stuck SELL order ID ${order.orderId}:`,
              e,
            );
          }
        }
      } catch (err) {
        this.logError(
          `Error checking SELL order status ID ${order.orderId}:`,
          err,
        );
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertSellOrders(
        Array.from(toReinsertLevels),
        priceFilter,
        lotSizeFilter,
        currentPrice,
      );
    }
  }

  private async reinsertSellOrders(
    levels: number[],
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const gridStep = this.config.profitMargin * currentPrice;

    for (const i of levels) {
      const sellPriceRaw = currentPrice + i * gridStep;
      const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);
      const quantity = this.roundToStep(
        this.config.totalQuantity / this.config.gridCount,
        lotSizeFilter.stepSize,
      );

      this.logInfo(
        `Reinserting LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${quantity}`,
      );

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'SELL',
          quantity.toString(),
          sellPrice.toString(),
          'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price),
          origQty: String(order.origQty),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logSuccess(
          `Reinserted SELL order created ID: ${normalizedOrder.orderId} at level ${i}`,
        );
      } catch (err) {
        this.logError(`Error reinserting SELL order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private roundToStep(value: number, step: string): number {
    return StrategyRuntimeUtils.roundToStep(value, step);
  }

  private async sleep(ms: number): Promise<void> {
    await StrategyRuntimeUtils.sleepInterruptible(ms, () => this.isRunning);
  }

  private calculateSleepDuration(): number {
    return StrategyRuntimeUtils.calculateSleepDuration(
      this.config.minSleepMs,
      this.config.maxSleepMs,
    );
  }

  private async exponentialBackoff(baseDelayMs: number, maxRetries: number) {
    await StrategyRuntimeUtils.exponentialBackoff(
      baseDelayMs,
      maxRetries,
      () => this.isRunning,
      (waitTime) => this.logInfo(`Retrying in ${waitTime} ms...`),
    );
  }

  private logSuccess(message: string, ...args: any[]) {
    this.logger.log(`${COLORS.fgGreen}${message}${COLORS.reset}`, ...args);
  }

  private logInfo(message: string, ...args: any[]) {
    this.logger.log(`${COLORS.fgCyan}${message}${COLORS.reset}`, ...args);
  }

  private logWarn(message: string, ...args: any[]) {
    this.logger.warn(
      `${COLORS.fgYellow}ALERTA: ${message}${COLORS.reset}`,
      ...args,
    );
  }

  private logError(message: string, ...args: any[]) {
    this.logger.error(`${COLORS.fgRed}${message}${COLORS.reset}`, ...args);
  }

  getProfitLoss() {
    return this.profitLoss;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logInfo(`Stopping Grid Sell on ${this.symbol}`);
  }
}
