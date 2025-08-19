import { Injectable } from '@nestjs/common';
import { TradingStrategy } from 'src/strategies/trading-strategy.interface';
import { StrategyFactory } from './strategy.factory';
import { BinanceService } from 'src/binance/binance.service';

@Injectable()
export class BotService {
  private activeStrategies = new Map<string, TradingStrategy>();

  constructor(private readonly binanceService: BinanceService) {}

  async startStrategy(symbol: string, strategyType: string, config: any) {
    if (this.activeStrategies.has(symbol)) {
      throw new Error(`Estrategia ya activa para ${symbol}`);
    }

    const strategy: TradingStrategy = StrategyFactory.createStrategy(
      strategyType,
      this.binanceService,
      symbol,
      config
    );

    this.activeStrategies.set(symbol, strategy);

    await strategy.run();
  }

  async stopStrategy(symbol: string) {
    const strategy = this.activeStrategies.get(symbol);
    if (strategy && strategy.stop) {
      await strategy.stop();
    }
    this.activeStrategies.delete(symbol);
  }

  getActiveBots(): string[] {
    return Array.from(this.activeStrategies.keys());
  }
}
