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
    buySafetyMargin?: number; // Porcentaje para reactivar niveles (ej. 0.01 = 1%)
  };

  private readonly logger = new LoggerMessages(new Logger(GridSellMarginFixedStrategy.name));
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private stoppedLossLevels = new Set<number>();
  private isRunning = true;
  private profitLoss = 0;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logger.logInfo(`Starting Grid SELL FIXED on ${this.symbol}`);
    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) {
      throw new Error(`Filters not found for ${this.symbol}`);
    }

    await this.cancelExistingOrdersInRange();

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();
        this.logger.logInfo(`Current price: ${currentPrice}`);

        this.reactivateStoppedLevels(currentPrice);

        await this.placeSellOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);

        const sleepDuration = this.calculateSleepDuration();
        this.logger.logInfo(`Sleeping ${sleepDuration} ms`);
        await this.sleep(sleepDuration);
      } catch (err) {
        this.logger.logError('Error in monitoring loop:', err);
        await this.exponentialBackoff(30000, 5);
      }
    }
  }

  private reactivateStoppedLevels(currentPrice: number) {
    if (!this.config.buySafetyMargin) return;
    for (const level of [...this.stoppedLossLevels]) {
      const orderLevel = this.config.ordersLevels[level];
      if (!orderLevel) continue;
      if (currentPrice >= orderLevel.price * (1 + this.config.buySafetyMargin)) {
        this.logger.logInfo(`Reactivating stopped level ${level} as current price ${currentPrice} > threshold.`);
        this.stoppedLossLevels.delete(level);
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
      if (!this.config.ordersLevels?.length) {
        this.logger.logWarn('No levels defined in config.ordersLevels for cancellation range.');
        return;
      }
      const prices = this.config.ordersLevels.map(level => level.price);
      const lowerPrice = Math.min(...prices);
      const upperPrice = Math.max(...prices);

      const activeSellOrdersInRange = allOrders.filter(o =>
        o.side === 'SELL' &&
        !['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(o.status) &&
        Number.isFinite(Number(o.price)) &&
        Number(o.price) >= lowerPrice &&
        Number(o.price) <= upperPrice
      );

      if (activeSellOrdersInRange.length === 0) {
        this.logger.logInfo('No active SELL orders in range.');
        return;
      }

      this.logger.logInfo(`Canceling orders in range [${lowerPrice}, ${upperPrice}]`);

      for (const order of activeSellOrdersInRange) {
        try {
          await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
          this.logger.logWarn(`Canceled SELL order ID ${order.orderId} price ${order.price}`);
          for (const [level, o] of this.openSellOrders.entries()) {
            if (o.orderId === order.orderId) {
              this.openSellOrders.delete(level);
              break;
            }
          }
        } catch (err) {
          this.logger.logError(`Error canceling order ID ${order.orderId}:`, err);
        }
      }
    } catch (err) {
      this.logger.logError('Error fetching or canceling orders:', err);
    }
  }

  private async placeSellOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (let i = 0; i < this.config.ordersLevels.length; i++) {
      const hasBuy = this.openBuyOrders.has(i);
      const hasSell = this.openSellOrders.has(i);
      const stopped = this.stoppedLossLevels.has(i);
      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      const sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);

      this.logger.logInfo(`Level ${i} - openBuyOrders: ${hasBuy}, openSellOrders: ${hasSell}, stoppedLossLevels: ${stopped}, sellPrice: ${sellPrice}, currentPrice: ${currentPrice}`);

      if (hasBuy) continue;
      if (stopped) {
        this.logger.logInfo(`Skipping level ${i} due to previous stop loss.`);
        continue;
      }
      if (hasSell) {
        this.logger.logInfo(`Skipping sell order at level ${i} because sell order is still open.`);
        continue;
      }
      if (sellPrice <= currentPrice) continue;

      this.logger.logInfo(`Level ${i} - Placing LIMIT SELL order price ${sellPrice}, currentPrice ${currentPrice}`);

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);
      this.logger.logInfo(`Placing LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${quantity}`);

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
          price: sellPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
        };

        this.openSellOrders.set(i, normalizedOrder);
        this.logger.logSuccess(`LIMIT SELL order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logger.logError(`Error creating LIMIT SELL order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private async checkSellOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (const [i, order] of this.openSellOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);
        if (statusData.status === 'FILLED') {
          this.logger.logSuccess(`Order SELL level ${i} filled ID: ${order.orderId}`);
          this.openSellOrders.delete(i);

          const filledPrice = parseFloat(statusData.avgPrice ?? order.price);
          const orderLevel = this.config.ordersLevels[i];
          if (!orderLevel) continue;

          const buyPrice = this.roundToStep(orderLevel.price * (1 - this.config.profitMargin), priceFilter.tickSize);
          const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);
          this.logger.logInfo(`Placing LIMIT BUY order level ${i} at price ${buyPrice}`);
          this.logger.logInfo(`Filled SELL at ${filledPrice}, placing BUY at ${buyPrice} for quantity ${quantity}`);

          try {
            const orderBuy = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol,
              'BUY',
              quantity.toString(),
              buyPrice.toString(),
              'GTC',
            );

            const normalizedBuyOrder: Order = {
              orderId: Number(orderBuy.orderId),
              price: buyPrice.toString(),
              origQty: quantity.toString(),
              timestamp: Date.now(),
            };

            this.openBuyOrders.set(i, normalizedBuyOrder);
            this.logger.logSuccess(`LIMIT BUY order created ID: ${normalizedBuyOrder.orderId} at level ${i}`);
          } catch (err) {
            this.logger.logError(`Error creating LIMIT BUY order at level ${i}:`, err);
          }
        }
      } catch (err) {
        this.logger.logError(`Error checking SELL order status ID ${order.orderId}:`, err);
      }
    }
  }

  private async checkBuyOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of this.openBuyOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

        if (statusData.status === 'FILLED') {
          this.logger.logSuccess(`Order BUY level ${i} completed ID: ${order.orderId}`);
          this.openBuyOrders.delete(i);

          const filledPrice = parseFloat(statusData.avgPrice ?? '0');
          const orderLevel = this.config.ordersLevels[i];
          if (!orderLevel) continue;

          // Aquí agregar lógica si se necesita gestionar algo al llenarse buy orders (por ejemplo ganar/perder)

          this.logger.logInfo(`BUY order filled at price ${filledPrice}, level ${i}`);
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logger.logWarn(`BUY order ID ${order.orderId} level ${i} stuck, canceling...`);
          try {
            await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
            this.openBuyOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logger.logError(`Error canceling stuck BUY order ID ${order.orderId}:`, e);
          }
        }
      } catch (err) {
        this.logger.logError(`Error checking BUY order status ID ${order.orderId}:`, err);
      }
    }

    if (toReinsertLevels.size > 0) {
      // Reinserta órdenes SELL para niveles con buy cancelado
      await this.reinsertSellOrders(Array.from(toReinsertLevels), priceFilter, lotSizeFilter, currentPrice);
    }
  }

  private async reinsertSellOrders(levels: number[], priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (const i of levels) {
      if (this.stoppedLossLevels.has(i)) {
        this.logger.logInfo(`Skipping reinsertion at level ${i} due to previous stop loss.`);
        continue;
      }

      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      const sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
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
          'GTC',
        );

        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: sellPrice.toString(),
          origQty: quantity.toString(),
          timestamp: Date.now(),
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

  public updateProfitMargin(newProfitMargin: number) {
    if (newProfitMargin < 0) {
      this.logger.logWarn('Profit margin no puede ser negativo.');
      return;
    }
    this.logger.logInfo(`Profit margin actualizado de ${this.config.profitMargin} a ${newProfitMargin}`);
    this.config.profitMargin = newProfitMargin;
  }

  public addOrderLevel(orderLevel: OrderLevel) {
    this.config.ordersLevels.push(orderLevel);
    this.config.gridCount = this.config.ordersLevels.length;
    this.logger.logInfo(`Nuevo nivel agregado: precio ${orderLevel.price}, cantidad ${orderLevel.quantity}. Total niveles: ${this.config.gridCount}`);
  }

  public async removeOrderLevel(levelIndex: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logger.logWarn(`Índice inválido para eliminar orden nivel: ${levelIndex}`);
      return;
    }
    const removed = this.config.ordersLevels.splice(levelIndex, 1)[0];
    this.config.gridCount = this.config.ordersLevels.length;
    this.logger.logInfo(`Nivel eliminado: precio ${removed.price}, cantidad ${removed.quantity}. Total niveles: ${this.config.gridCount}`);

    if (this.openBuyOrders.has(levelIndex)) {
      const order = this.openBuyOrders.get(levelIndex);
      if (order) {
        await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
        this.openBuyOrders.delete(levelIndex);
        this.logger.logInfo(`Orden BUY cancelada en nivel ${levelIndex}`);
      }
    }
    if (this.openSellOrders.has(levelIndex)) {
      const order = this.openSellOrders.get(levelIndex);
      if (order) {
        await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
        this.openSellOrders.delete(levelIndex);
        this.logger.logInfo(`Orden SELL cancelada en nivel ${levelIndex}`);
      }
    }
  }

  public updateOrderLevelQuantity(levelIndex: number, newQuantity: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logger.logWarn(`Índice inválido para actualizar cantidad de orden: ${levelIndex}`);
      return;
    }
    this.config.ordersLevels[levelIndex].quantity = newQuantity;
    this.logger.logInfo(`Cantidad en nivel ${levelIndex} actualizada a ${newQuantity}`);
  }

  public getOrderLevels(): OrderLevel[] {
    return [...this.config.ordersLevels];
  }

  public getOrderLevelsStatus() {
    return this.config.ordersLevels.map((level, index) => ({
      index,
      price: level.price,
      quantity: level.quantity,
      hasOpenBuyOrder: this.openBuyOrders.has(index),
      hasOpenSellOrder: this.openSellOrders.has(index),
      isStopped: this.stoppedLossLevels.has(index),
    }));
  }

  public async clearAllOrderLevels() {
    const levelsIndices = this.config.ordersLevels.map((_, i) => i);
    for (const index of levelsIndices) {
      await this.removeOrderLevel(index);
    }
    this.config.ordersLevels = [];
    this.config.gridCount = 0;
    this.logger.logInfo('Todos los niveles y órdenes han sido eliminados.');
  }

  public updateOrderLevelPrice(levelIndex: number, newPrice: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logger.logWarn(`Índice inválido para actualizar precio de orden: ${levelIndex}`);
      return;
    }
    this.config.ordersLevels[levelIndex].price = newPrice;
    this.logger.logInfo(`Precio en nivel ${levelIndex} actualizado a ${newPrice}`);
  }

  public stopOrderLevel(levelIndex: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logger.logWarn(`Índice inválido para detener nivel: ${levelIndex}`);
      return;
    }
    this.stoppedLossLevels.add(levelIndex);
    this.logger.logInfo(`Nivel ${levelIndex} marcado como detenido.`);
  }

  public reactivateOrderLevel(levelIndex: number) {
    if (this.stoppedLossLevels.delete(levelIndex)) {
      this.logger.logInfo(`Nivel ${levelIndex} reactivado manualmente.`);
    } else {
      this.logger.logWarn(`Nivel ${levelIndex} no estaba detenido.`);
    }
  }
}
