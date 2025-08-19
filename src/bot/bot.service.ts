// bot/bot.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { TradingStrategy } from 'src/strategies/trading-strategy.interface';

@Injectable()
export class BotService {
  private activeStrategies = new Map<string, TradingStrategy>();

  // Registra y ejecuta una estrategia dinámica por símbolo y tipo
  async startStrategy(symbol: string, strategy: TradingStrategy) {
    if (this.activeStrategies.has(symbol)) {
      throw new Error(`Estrategia ya activa para ${symbol}`);
    }
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
}
