import { Injectable, Logger } from '@nestjs/common';
import { RsiStrategyConfig, TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

interface Order {
  orderId: string;
  side: 'BUY' | 'SELL';
  price: number;
  timestamp: number;
}

@Injectable()
export class RsiStrategy implements TradingStrategy<RsiStrategyConfig> {
  id:string;
  symbol: string;
  config: RsiStrategyConfig;

  private readonly logger = new Logger(RsiStrategy.name);
  private isRunning = true;
  private inPosition = false;

  private entryPrice: number | null = null;
  private profitLoss = 0;

  private buyOrders: Order[] = [];
  private currentSellOrder: Order | null = null;

  private tickSize: number = 0.00000001; // valor por defecto

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logInfo(`Iniciando estrategia RSI en ${this.symbol}`);

    this.tickSize = await this.binanceService.getSymbolTickSize(this.symbol);

    let candles = await this.binanceService.getCandles(this.symbol, '1m', this.config.rsiPeriod + 1);
    let closePrices = candles.map(c => parseFloat(c.close));

    while (this.isRunning) {
      try {
        const rsi = this.calculateRSI(closePrices, this.config.rsiPeriod);
        this.logInfo(`RSI: ${rsi.toFixed(2)}`);

        const currentPriceResp = await this.binanceService.getSymbolPrice(this.symbol);
        const currentPrice = parseFloat(currentPriceResp.price);

        await this.manageOrdersTimeout();

        if (!this.inPosition && rsi <= this.config.oversoldThreshold) {
          this.logInfo(`RSI ${rsi.toFixed(2)} indica compra, colocando órdenes escalonadas por debajo del precio actual`);
          await this.placeBuyOrders(currentPrice);
          this.inPosition = true;
          this.entryPrice = currentPrice;
        } else if (this.inPosition && rsi >= this.config.overboughtThreshold) {
          this.logInfo(`RSI ${rsi.toFixed(2)} indica venta limit`);

          if (this.entryPrice) {
            // La orden de venta se coloca siempre sobre el precio de compra para asegurar ganancias
            await this.placeSellOrder(this.entryPrice);
            this.inPosition = false;

            this.profitLoss += (currentPrice - this.entryPrice) * this.config.tradeQuantity;
            this.logInfo(`Profit/Loss acumulado: ${this.profitLoss.toFixed(8)}`);
            this.entryPrice = null;
            this.buyOrders = [];
          } else {
            this.logError('No hay precio de entrada guardado para la venta');
          }
        } else if (this.inPosition) {
          const stopLossTriggerPrice = this.entryPrice! * (1 - (this.config.stopLossMargin ?? 0) / 100);
          if (currentPrice <= stopLossTriggerPrice) {
            this.logInfo(`Precio bajo stop loss (${stopLossTriggerPrice}), vendiendo para limitar pérdida.`);

            if (this.entryPrice) {
              await this.placeSellOrder(this.entryPrice);
              this.inPosition = false;

              this.profitLoss += (currentPrice - this.entryPrice) * this.config.tradeQuantity;
              this.logInfo(`Profit/Loss tras stop loss: ${this.profitLoss.toFixed(8)}`);

              this.entryPrice = null;
              this.buyOrders = [];
            }
          }
        }

        const lastCandle = await this.getLastCandleClose();
        if (lastCandle !== null) {
          closePrices.push(lastCandle);
          if (closePrices.length > this.config.rsiPeriod + 1) closePrices.shift();
        }

        const sleepMs = this.config.minSleepMs || 15000;
        this.logInfo(`Durmiendo ${sleepMs} ms`);
        await this.sleep(sleepMs);
      } catch (error) {
        this.logError('Error en loop RSI:', error);
        await this.sleep(30000);
      }
    }
  }

  private async placeBuyOrders(currentPrice: number) {
    const numOrders = this.config.numBuyOrders || 1;
    const quantityPerOrder = this.config.tradeQuantity / numOrders;
    let priceBase = currentPrice;

    for (let i = 1; i <= numOrders; i++) {
      const priceOffsetPercent = this.config.profitMargin || 0;
      let rawBuyPrice = priceBase * (1 - priceOffsetPercent / 100);
      const adjustedBuyPrice = this.adjustPriceToTickSize(rawBuyPrice);
      const quantity = quantityPerOrder.toString();

      try {
        const order = await this.binanceService.createLimitOrder(
          this.symbol,
          'BUY',
          quantity,
          adjustedBuyPrice.toString(),
          'GTC',
        );
        this.buyOrders.push({
          orderId: order.orderId,
          side: 'BUY',
          price: adjustedBuyPrice,
          timestamp: Date.now(),
        });
        this.logSuccess(
          `Orden LIMIT BUY #${i} colocada a ${adjustedBuyPrice}, orderId: ${order.orderId}`,
        );
      } catch (error) {
        this.logError(`Error colocando orden LIMIT BUY #${i}:`, error);
      }

      priceBase = adjustedBuyPrice;
    }
  }

  private async placeSellOrder(priceBase: number) {
    for (const order of this.buyOrders) {
      await this.cancelOrder(order.orderId);
    }
    this.buyOrders = [];

    const quantity = this.config.tradeQuantity.toString();
    const priceOffsetPercent = this.config.profitMargin || 0;
    let rawSellPrice = priceBase * (1 + priceOffsetPercent / 100);
    const adjustedSellPrice = this.adjustPriceToTickSize(rawSellPrice);

    try {
      const order = await this.binanceService.createLimitOrder(
        this.symbol,
        'SELL',
        quantity,
        adjustedSellPrice.toString(),
        'GTC',
      );
      this.currentSellOrder = {
        orderId: order.orderId,
        side: 'SELL',
        price: adjustedSellPrice,
        timestamp: Date.now(),
      };
      this.logSuccess(
        `Orden LIMIT SELL colocada a ${adjustedSellPrice}, orderId: ${order.orderId}`,
      );
    } catch (error) {
      this.logError('Error colocando LIMIT SELL:', error);
    }
  }

  private async manageOrdersTimeout() {
    const now = Date.now();

    const remainingOrders: Order[] = [];
    for (const order of this.buyOrders) {
      if (now - order.timestamp > (this.config.maxOrderAgeMs ?? 180000)) {
        this.logInfo(
          `Cancelando orden BUY pendiente ${order.orderId} tras tiempo de espera`,
        );
        await this.cancelOrder(order.orderId);
      } else {
        remainingOrders.push(order);
      }
    }
    this.buyOrders = remainingOrders;

    if (
      this.currentSellOrder &&
      now - this.currentSellOrder.timestamp > (this.config.maxOrderAgeMs ?? 180000)
    ) {
      this.logInfo(
        `Cancelando orden SELL pendiente ${this.currentSellOrder.orderId} tras tiempo de espera`,
      );
      await this.cancelOrder(this.currentSellOrder.orderId);
      this.currentSellOrder = null;
    }
  }

  private async cancelOrder(orderId: string) {
    try {
      await this.binanceService.cancelOrder(this.symbol, Number(orderId));
      this.logInfo(`Orden ${orderId} cancelada exitosamente`);
    } catch (error) {
      this.logError(`Error cancelando orden ${orderId}:`, error);
    }
  }

  private adjustPriceToTickSize(price: number): number {
    return Math.floor(price / this.tickSize) * this.tickSize;
  }

  private calculateRSI(prices: number[], period: number): number {
    if (prices.length <= period) {
      return 50; // Valor neutral cuando no hay suficientes datos
    }

    let gains = 0;
    let losses = 0;

    // Suma inicial de ganancias y pérdidas
    for (let i = 1; i <= period; i++) {
      const delta = prices[i] - prices[i - 1];
      if (delta >= 0) gains += delta;
      else losses -= delta;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Suavizado con medias móviles exponenciales
    for (let i = period + 1; i < prices.length; i++) {
      const delta = prices[i] - prices[i - 1];
      let gain = 0;
      let loss = 0;
      if (delta >= 0) gain = delta;
      else loss = -delta;

      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private async getLastCandleClose(): Promise<number | null> {
    try {
      const candles = await this.binanceService.getCandles(this.symbol, '1m', 1);
      if (candles && candles.length > 0) return parseFloat(candles[0].close);
      return null;
    } catch (error) {
      this.logError('Error obteniendo última vela:', error);
      return null;
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logInfo(message: string, ...args: any[]) {
    this.logger.log(message, ...args);
  }

  private logError(message: string, ...args: any[]) {
    this.logger.error(message, ...args);
  }

  private logSuccess(message: string, ...args: any[]) {
    this.logger.log(message, ...args);
  }
}
