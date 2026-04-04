import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TradingStrategy } from 'src/strategies/trading-strategy.interface';
import { StrategyFactory } from './strategy.factory';
import { BinanceService } from 'src/binance/binance.service';
import { StrategiesTradingService } from 'src/strategies-trading/strategies-trading.service';
import { CreateTradingStrategyDto } from 'src/strategies-trading/dto/create-strategies-trading.dto';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private activeStrategies = new Map<string, TradingStrategy>();

  constructor(
    private readonly binanceService: BinanceService,
    private readonly strategiesTradingService: StrategiesTradingService,
  ) {}

  private getKey(symbol: string, id: string): string {
    return `${symbol}-${id}`;
  }

  async startStrategy(symbol: string, typeId: number, strategyType: string, config: any, id: string) {
    const key = this.getKey(symbol, id);

    if (this.activeStrategies.has(key)) {
      throw new BadRequestException(`Estrategia ya activa con este símbolo ${symbol} y el id ${id}`);
    }

    const strategy: TradingStrategy = StrategyFactory.createStrategy(
      strategyType,
      this.binanceService,
      id,
      symbol,
      config,
    );

    const createTradingStrategyDto: CreateTradingStrategyDto = {
      symbol: symbol,
      typeId: typeId,
      config: config,
      strategyType: strategyType,
      id: id,
    };

    await this.ensureStrategyMetadata(createTradingStrategyDto);

    this.activeStrategies.set(key, strategy);

    try {
      await strategy.run();
    } catch (error) {
      this.activeStrategies.delete(key);
      this.logger.error(`Error iniciando estrategia ${id} para ${symbol}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
  
  async stopStrategy(symbol: string, id: string) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con símbolo ${symbol} e id ${id} no encontrada`);
    }

    if (strategy.stop) {
      await strategy.stop();
    }

    this.activeStrategies.delete(key);
  }

  getActiveBots(): string[] {
    return Array.from(this.activeStrategies.keys());
  }

  async getActiveBotsData() {
    const strategies = Array.from(this.activeStrategies.values());

    const newStrategiesData = strategies.map((strategy) => ({
      id: strategy.id,
      symbol: strategy.symbol,
      config: strategy.config,
      strategyType: strategy.constructor,
    }));

    return newStrategiesData;
  }

  getBots() {
    return Array.from(this.activeStrategies.entries()).map(([key, strategy]) => {
      const [symbol, id] = key.split('-');
      return {
        symbol,
        id,
        strategy,
      };
    });
  }

  

  async updateOrderLevelPrice(id: string, symbol: string, levelIndex: number, newPrice: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['updateOrderLevelPrice'] === 'function') {
      await strategy['updateOrderLevelPrice'](levelIndex, newPrice);
      return true;
    }
    throw new BadRequestException(`La estrategia con id ${id} no soporta actualizar precio de nivel`);
  }

  async removeOrderLevel(id: string, symbol: string, levelIndex: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['removeOrderLevel'] === 'function') {
      await strategy['removeOrderLevel'](levelIndex);
      return true;
    }
    throw new BadRequestException(`La estrategia con id ${id} no soporta eliminar niveles de orden`);
  }

  addOrderLevel(id: string, symbol: string, orderLevel: any) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['addOrderLevel'] === 'function') {
      strategy['addOrderLevel'](orderLevel);
      return true;
    }
    throw new BadRequestException(`La estrategia con id ${id} no soporta agregar niveles de orden`);
  }

  updateProfitMargin(id: string, symbol: string, newProfitMargin: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['updateProfitMargin'] === 'function') {
      strategy['updateProfitMargin'](newProfitMargin);
      return true;
    }
    throw new BadRequestException(`La estrategia con id ${id} no soporta actualización de profit margin`);
  }

  private async ensureStrategyMetadata(createTradingStrategyDto: CreateTradingStrategyDto) {
    try {
      await this.strategiesTradingService.getStrategyById(createTradingStrategyDto.id);
      await this.strategiesTradingService.updateStrategy(createTradingStrategyDto.id, {
        symbol: createTradingStrategyDto.symbol,
        typeId: createTradingStrategyDto.typeId,
        config: createTradingStrategyDto.config,
        strategyType: createTradingStrategyDto.strategyType,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        await this.strategiesTradingService.createStrategies(createTradingStrategyDto);
        return;
      }

      throw error;
    }
  }
}
