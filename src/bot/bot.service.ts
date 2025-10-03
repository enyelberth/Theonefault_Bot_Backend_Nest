import { Injectable } from '@nestjs/common';
import { TradingStrategy } from 'src/strategies/trading-strategy.interface';
import { StrategyFactory } from './strategy.factory';
import { BinanceService } from 'src/binance/binance.service';
import { StrategiesTradingService } from 'src/strategies-trading/strategies-trading.service';
import { CreateTradingStrategyDto } from 'src/strategies-trading/dto/create-strategies-trading.dto';

@Injectable()
export class BotService {
  private activeStrategies = new Map<string, TradingStrategy>();

  constructor(private readonly binanceService: BinanceService,
    private readonly strategiesTradingService: StrategiesTradingService
  ) { }

  async startStrategy(symbol: string, typeId: number, strategyType: string, config: any, id: string) {

    if (this.activeStrategies.has(id)) {
      throw new Error(`Estrategia ya activa con este simbol  ${symbol} y el id ${id} `);
    }

    const strategy: TradingStrategy = StrategyFactory.createStrategy(
      strategyType,
      this.binanceService,
      id,
      symbol,
      config
    );

    const createTradingStrategyDto: CreateTradingStrategyDto = {
      symbol: symbol,
      typeId: typeId,
      config: config,
      strategyType: strategyType,
      id: id,


    }

    /* this.strategiesTradingService.createStrategies(createTradingStrategyDto)*/
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
  async getActiveBotsData() {
    const strategies = Array.from(this.activeStrategies.values());

    const newStrategiesData = strategies.map(strategy => ({
      symbol: strategy.symbol,
      config: strategy.config,
      strategyType: strategy.constructor,
    }));
    console.log(newStrategiesData)
    return newStrategiesData


  }
  getBots() {

    return Array.from(this.activeStrategies.entries()).map(([symbol, strategy]) => ({
      symbol,
      strategy
    }));
  }
  getBotss() {


    return Array.from(this.activeStrategies.entries()).map(([symbol, strategy]) => ({
      symbol,
      strategy
    }));

  }

}
