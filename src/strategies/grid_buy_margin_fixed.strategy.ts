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
    buySafetyMargin?: number; // Porcentaje para reactivar niveles (ej. 0.01 = 1%)
  };

  private readonly logger = new Logger(GridBuyMarginFixedStrategy.name);
  private readonly logMessages = new LoggerMessages(this.logger);
  private stoppedLossLevels = new Set<number>();

  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private isRunning = true;
  private profitLoss = 0;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logMessages.logInfo(`Starting Grid BUY FIXED on ${this.symbol}`);
    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) {
      throw new Error(`Filters not found for ${this.symbol}`);
    }

    await this.cancelExistingOrdersInRange();

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();
        this.logMessages.logInfo(`Current price: ${currentPrice}`);

        this.reactivateStoppedLevels(currentPrice);

        await this.placeBuyOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);
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

  private reactivateStoppedLevels(currentPrice: number) {
    try{


    if (!this.config.buySafetyMargin) return;
    for (const level of [...this.stoppedLossLevels]) {
      const orderLevel = this.config.ordersLevels[level];
      if (!orderLevel) continue;
      if (currentPrice >= orderLevel.price * (1 + this.config.buySafetyMargin)) {
        this.logMessages.logInfo(`Reactivating stopped level ${level} as current price ${currentPrice} > threshold.`);
        this.stoppedLossLevels.delete(level);
      }
    }
  }catch(error){
    console.log(error);
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
        this.logMessages.logWarn('No levels defined in config.ordersLevels for cancellation range.');
        return;
      }
      const prices = this.config.ordersLevels.map(level => level.price);
      const lowerPrice = Math.min(...prices);
      const upperPrice = Math.max(...prices);

      const activeBuyOrdersInRange = allOrders.filter(o =>
        o.side === 'BUY' &&
        !['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(o.status) &&
        Number.isFinite(Number(o.price)) &&
        Number(o.price) >= lowerPrice &&
        Number(o.price) <= upperPrice
      );

      if (activeBuyOrdersInRange.length === 0) {
        this.logMessages.logInfo('No active BUY orders in range.');
        return;
      }

      this.logMessages.logInfo(`Canceling orders in range [${lowerPrice}, ${upperPrice}]`);

      for (const order of activeBuyOrdersInRange) {
        try {
          await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
          this.logMessages.logWarn(`Canceled BUY order ID ${order.orderId} price ${order.price}`);
        } catch (err) {
          this.logMessages.logError(`Error canceling order ID ${order.orderId}:`, err);
        }
      }
    } catch (err) {
      this.logMessages.logError('Error fetching or canceling orders:', err);
    }
  }

  private async placeBuyOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (let i = 0; i < this.config.ordersLevels.length; i++) {
      const hasBuy = this.openBuyOrders.has(i);
      const hasSell = this.openSellOrders.has(i);
      const stopped = this.stoppedLossLevels.has(i);
      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      const buyPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);

      this.logMessages.logInfo(`Level ${i} - openBuyOrders: ${hasBuy}, openSellOrders: ${hasSell}, stoppedLossLevels: ${stopped}, buyPrice: ${buyPrice}, currentPrice: ${currentPrice}`);

      if (hasBuy) continue;
      if (stopped) {
        this.logMessages.logInfo(`Skipping level ${i} due to previous stop loss.`);
        continue;
      }
      if (hasSell) {
        this.logMessages.logInfo(`Skipping buy order at level ${i} because sell order is still open.`);
        continue;
      }
      if (buyPrice >= currentPrice) continue;

      this.logMessages.logInfo(`Level ${i} - Placing LIMIT BUY order price ${buyPrice}, currentPrice ${currentPrice}`);

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);
      this.logMessages.logInfo(`Placing LIMIT BUY order level ${i}, price ${buyPrice}, quantity ${quantity}`);

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
        this.logMessages.logSuccess(`LIMIT BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
      } catch (err) {
        this.logMessages.logError(`Error creating LIMIT BUY order at level ${i}:`, err);
      }

      await this.sleep(250);
    }
  }

  private async checkBuyOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (const [i, order] of this.openBuyOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);
        if (statusData.status === 'FILLED') {
          this.logMessages.logSuccess(`Order BUY level ${i} filled ID: ${order.orderId}`);
          this.openBuyOrders.delete(i);

          const filledPrice = parseFloat(statusData.avgPrice ?? order.price);
          const orderLevel = this.config.ordersLevels[i];
          if (!orderLevel) continue;

          const sellPrice = this.roundToStep(orderLevel.price * (1 + this.config.profitMargin), priceFilter.tickSize);
          const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);
          this.logMessages.logInfo(`Placing LIMIT SELL order level ${i} at price ${sellPrice}`);
          this.logMessages.logInfo(`Filled BUY at ${filledPrice}, placing SELL at ${sellPrice} for quantity ${quantity}`);

          try {
            const orderSell = await this.binanceService.createCrossMarginLimitOrder(
              this.symbol,
              'SELL',
              quantity.toString(),
              sellPrice.toString(),
              'GTC',
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
        }
      } catch (err) {
        this.logMessages.logError(`Error checking BUY order status ID ${order.orderId}:`, err);
      }
    }
  }

  private async checkSellOrders(priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of this.openSellOrders.entries()) {
      try {
        const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

        if (statusData.status === 'FILLED') {
          this.logMessages.logSuccess(`Order SELL level ${i} completed ID: ${order.orderId}`);
          this.openSellOrders.delete(i);
          this.openBuyOrders.delete(i);

          const filledPrice = parseFloat(statusData.avgPrice ?? '0');
          const orderLevel = this.config.ordersLevels[i];
          if (!orderLevel) continue;

          const baseCost = orderLevel.price / (1 + this.config.profitMargin * this.config.gridCount);
          const quantity = orderLevel.quantity;
          const profit = (filledPrice - baseCost) * quantity;

          this.profitLoss += profit;
          this.logMessages.logInfo(`Profit/loss updated by ${profit} at level ${i}, total: ${this.profitLoss}`);
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logMessages.logWarn(`SELL order ID ${order.orderId} level ${i} stuck, canceling...`);
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

  private async reinsertSellOrders(levels: number[], priceFilter: { tickSize: string }, lotSizeFilter: { stepSize: string }, currentPrice: number) {
    for (const i of levels) {
      const orderLevel = this.config.ordersLevels[i];
      if (!orderLevel) continue;

      const sellPrice = this.roundToStep(orderLevel.price, priceFilter.tickSize);
      this.logMessages.logInfo(`Attempting to reinsert LIMIT SELL order level ${i}: sellPrice=${sellPrice}, currentPrice=${currentPrice}`);

      if (sellPrice <= currentPrice) {
        this.logMessages.logInfo(`Skipping reinsertion at level ${i} because sellPrice <= currentPrice`);
        continue;
      }

      const quantity = this.roundToStep(orderLevel.quantity, lotSizeFilter.stepSize);
      this.logMessages.logInfo(`Reinserting LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${quantity}`);

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
      this.logMessages.logInfo(`Retrying in ${waitTime} ms...`);
      await this.sleep(waitTime);
    }
  }

  public updateProfitMargin(newProfitMargin: number) {
    if (newProfitMargin < 0) {
      this.logMessages.logWarn('Profit margin no puede ser negativo.');
      return;
    }
    this.logMessages.logInfo(`Profit margin actualizado de ${this.config.profitMargin} a ${newProfitMargin}`);
    this.config.profitMargin = newProfitMargin;
  }

  public addOrderLevel(orderLevel: OrderLevel) {
    this.config.ordersLevels.push(orderLevel);
    this.config.gridCount = this.config.ordersLevels.length;
    this.logMessages.logInfo(`Nuevo nivel agregado: precio ${orderLevel.price}, cantidad ${orderLevel.quantity}. Total niveles: ${this.config.gridCount}`);
  }

  public async removeOrderLevel(levelIndex: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logMessages.logWarn(`Índice inválido para eliminar orden nivel: ${levelIndex}`);
      return;
    }
    const removed = this.config.ordersLevels.splice(levelIndex, 1)[0];
    this.config.gridCount = this.config.ordersLevels.length;
    this.logMessages.logInfo(`Nivel eliminado: precio ${removed.price}, cantidad ${removed.quantity}. Total niveles: ${this.config.gridCount}`);

    // Cancelar órdenes abiertas buy y sell en ese nivel
    if (this.openBuyOrders.has(levelIndex)) {
      const order = this.openBuyOrders.get(levelIndex);
      if (order) {
        await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
        this.openBuyOrders.delete(levelIndex);
        this.logMessages.logInfo(`Orden BUY cancelada en nivel ${levelIndex}`);
      }
    }
    if (this.openSellOrders.has(levelIndex)) {
      const order = this.openSellOrders.get(levelIndex);
      if (order) {
        await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
        this.openSellOrders.delete(levelIndex);
        this.logMessages.logInfo(`Orden SELL cancelada en nivel ${levelIndex}`);
      }
    }
  }

  public updateOrderLevelQuantity(levelIndex: number, newQuantity: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logMessages.logWarn(`Índice inválido para actualizar cantidad de orden: ${levelIndex}`);
      return;
    }
    this.config.ordersLevels[levelIndex].quantity = newQuantity;
    this.logMessages.logInfo(`Cantidad en nivel ${levelIndex} actualizada a ${newQuantity}`);
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
    // Clonamos array para evitar modificar mientras iteramos
    const levelsIndices = this.config.ordersLevels.map((_, i) => i);
    for (const index of levelsIndices) {
      await this.removeOrderLevel(index);
    }
    this.config.ordersLevels = [];
    this.config.gridCount = 0;
    this.logMessages.logInfo('Todos los niveles y órdenes han sido eliminados.');
  }

  public updateOrderLevelPrice(levelIndex: number, newPrice: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logMessages.logWarn(`Índice inválido para actualizar precio de orden: ${levelIndex}`);
      return;
    }
    this.config.ordersLevels[levelIndex].price = newPrice;
    this.logMessages.logInfo(`Precio en nivel ${levelIndex} actualizado a ${newPrice}`);
  }

  public stopOrderLevel(levelIndex: number) {
    if (levelIndex < 0 || levelIndex >= this.config.ordersLevels.length) {
      this.logMessages.logWarn(`Índice inválido para detener nivel: ${levelIndex}`);
      return;
    }
    this.stoppedLossLevels.add(levelIndex);
    this.logMessages.logInfo(`Nivel ${levelIndex} marcado como detenido.`);
  }

  public reactivateOrderLevel(levelIndex: number) {
    if (this.stoppedLossLevels.delete(levelIndex)) {
      this.logMessages.logInfo(`Nivel ${levelIndex} reactivado manualmente.`);
    } else {
      this.logMessages.logWarn(`Nivel ${levelIndex} no estaba detenido.`);
    }
  }
}
