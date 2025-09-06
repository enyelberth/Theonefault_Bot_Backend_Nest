import { Injectable, Logger } from '@nestjs/common';
import { RsiStrategyConfig, TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class RsiStrategy implements TradingStrategy<RsiStrategyConfig> {
  symbol: string;
  config: RsiStrategyConfig;

  private readonly logger = new Logger(RsiStrategy.name);
  private isRunning = true;
  private inPosition = false; // Para evitar multiples ordenes abiertas

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logInfo(`Starting RSI strategy on ${this.symbol} with config ${JSON.stringify(this.config)}`);

    while (this.isRunning) {
      try {
        // Obtener precios históricos para calcular RSI
        const candles = await this.binanceService.getCandles(this.symbol, '1m', this.config.rsiPeriod + 1);
        const closePrices = candles.map(c => parseFloat(c.close));

        // Calcular RSI
        const rsi = this.calculateRSI(closePrices, this.config.rsiPeriod);
        this.logInfo(`Current RSI: ${rsi.toFixed(2)}`);

        const currentPriceResp = await this.binanceService.getSymbolPrice(this.symbol);
        const currentPrice = parseFloat(currentPriceResp.price);

        // Lógica de trading
        if (rsi <= this.config.oversoldThreshold && !this.inPosition) {
          this.logInfo(`RSI ${rsi.toFixed(2)} <= ${this.config.oversoldThreshold}, placing BUY order`);
          await this.placeBuyOrder(currentPrice);
          this.inPosition = true;
        } else if (rsi >= this.config.overboughtThreshold && this.inPosition) {
          this.logInfo(`RSI ${rsi.toFixed(2)} >= ${this.config.overboughtThreshold}, placing SELL order`);
          await this.placeSellOrder(currentPrice);
          this.inPosition = false;
        } else {
          this.logInfo('No trade signal detected. Waiting...');
        }

        // Esperar antes del siguiente ciclo
        const sleepMs = this.config.minSleepMs || 15000;
        this.logInfo(`Sleeping ${sleepMs} ms`);
        await this.sleep(sleepMs);

      } catch (error) {
        this.logError('Error in RSI strategy run loop:', error);
        await this.sleep(30000); // Espera más larga en caso de error
      }
    }
  }

  private calculateRSI(prices: number[], period: number): number {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i < prices.length; i++) {
      const delta = prices[i] - prices[i - 1];
      if (delta > 0) gains += delta;
      else losses -= delta;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  private async placeBuyOrder(price: number) {
    try {
      const quantity = this.config.tradeQuantity.toString();
      const order = await this.binanceService.createMarketOrder(this.symbol, 'BUY', quantity);
      this.logSuccess(`BUY order placed at market price ${price}, orderId: ${order.orderId}`);
    } catch (error) {
      this.logError('Error placing BUY order:', error);
    }
  }

  private async placeSellOrder(price: number) {
    try {
      const quantity = this.config.tradeQuantity.toString();
      const order = await this.binanceService.createMarketOrder(this.symbol, 'SELL', quantity);
      this.logSuccess(`SELL order placed at market price ${price}, orderId: ${order.orderId}`);
    } catch (error) {
      this.logError('Error placing SELL order:', error);
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
