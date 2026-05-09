import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  isMutableOrderLevelsStrategy,
  isProfitMarginUpdatableStrategy,
  MutableOrderLevelsStrategy,
  ProfitMarginUpdatableStrategy,
  TradingStrategy,
} from 'src/strategies/trading-strategy.interface';
import { StrategyFactory } from './strategy.factory';
import { BinanceService } from 'src/binance/binance.service';
import { StrategiesTradingService } from 'src/strategies-trading/strategies-trading.service';
import { CreateTradingStrategyDto } from 'src/strategies-trading/dto/create-strategies-trading.dto';
import { BotConfigDto, OrderLevelDto } from './dto/create-bot.dto';
import { StrategyOpsService } from 'src/strategy-monitoring/strategy-ops.service';
import { StrategyRuntimeContextService } from 'src/strategy-monitoring/strategy-runtime-context.service';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private activeStrategies = new Map<string, TradingStrategy>();
  private strategyTasks = new Map<string, Promise<void>>();
  private readonly decisionLog: Array<{
    symbol: string;
    strategyId: string;
    event: string;
    reason?: string;
    result?: string;
    timestamp: string;
  }> = [];

  constructor(
    private readonly binanceService: BinanceService,
    private readonly strategiesTradingService: StrategiesTradingService,
    private readonly strategyOpsService: StrategyOpsService,
    private readonly strategyRuntimeContext: StrategyRuntimeContextService,
  ) {}

  private recordDecision(
    symbol: string,
    strategyId: string,
    event: string,
    reason?: string,
    result?: string,
  ) {
    this.decisionLog.unshift({
      symbol,
      strategyId,
      event,
      reason,
      result,
      timestamp: new Date().toISOString(),
    });

    if (this.decisionLog.length > 300) {
      this.decisionLog.pop();
    }
  }

  private getKey(symbol: string, id: string): string {
    return `${symbol}-${id}`;
  }

  async startStrategy(
    symbol: string,
    typeId: number,
    strategyType: string,
    config: BotConfigDto,
    id: string,
  ) {
    const key = this.getKey(symbol, id);

    if (this.activeStrategies.has(key)) {
      throw new BadRequestException(
        `Estrategia ya activa con este símbolo ${symbol} y el id ${id}`,
      );
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
    this.recordDecision(
      symbol,
      id,
      'START_REQUESTED',
      'manual_start',
      'pending',
    );

    this.activeStrategies.set(key, strategy);

    const runTask = this.strategyRuntimeContext
      .runWithContext(
        {
          strategyId: id,
          strategyType,
          symbol,
          config: (config ?? {}) as unknown as Record<string, unknown>,
        },
        () => strategy.run(),
      )
      .then(() => {
        this.recordDecision(
          symbol,
          id,
          'STOPPED',
          'strategy_run_completed',
          'ok',
        );
      })
      .catch((error) => {
        this.recordDecision(
          symbol,
          id,
          'START_FAILED',
          error instanceof Error ? error.message : 'unknown',
          'error',
        );
        this.logger.error(
          `Error en estrategia ${id} para ${symbol}`,
          error instanceof Error ? error.stack : undefined,
        );
      })
      .finally(() => {
        this.activeStrategies.delete(key);
        this.strategyTasks.delete(key);
      });

    this.strategyTasks.set(key, runTask);
    this.recordDecision(symbol, id, 'STARTED', 'strategy_run_background', 'ok');
  }

  async stopStrategy(symbol: string, id: string) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(
        `Estrategia con símbolo ${symbol} e id ${id} no encontrada`,
      );
    }

    await strategy.stop();

    const task = this.strategyTasks.get(key);
    if (task) {
      await task;
    }

    this.activeStrategies.delete(key);
    this.strategyTasks.delete(key);
    this.recordDecision(symbol, id, 'STOPPED', 'manual_stop', 'ok');
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
      strategyType: strategy.constructor.name,
    }));

    return newStrategiesData;
  }

  getBots() {
    return Array.from(this.activeStrategies.values()).map((strategy) => {
      return {
        symbol: strategy.symbol,
        id: strategy.id,
        strategy,
      };
    });
  }

  getDecisionLog(symbol?: string, strategyId?: string) {
    return this.decisionLog.filter((item) => {
      if (symbol && item.symbol !== symbol) {
        return false;
      }
      if (strategyId && item.strategyId !== strategyId) {
        return false;
      }
      return true;
    });
  }

  getExecutionLog(strategyId?: string, symbol?: string) {
    return this.strategyOpsService.getExecutionLog(strategyId, symbol);
  }

  getPerformance(strategyId?: string): unknown {
    return this.strategyOpsService.getStrategyStats(strategyId);
  }

  async getPerformanceHistory(strategyId?: string, from?: string, to?: string) {
    return this.strategyOpsService.getStrategyPerformanceHistory(
      strategyId,
      from,
      to,
    );
  }

  async getDashboard(strategyId?: string) {
    return this.strategyOpsService.getStrategyDashboard(strategyId);
  }

  async updateRiskControls(
    strategyId: string,
    payload: {
      maxOpenPositions?: number;
      maxDailyLoss?: number;
      maxNotionalPerOrder?: number;
      cooldownMsAfterLoss?: number;
    },
  ) {
    const strategy =
      await this.strategiesTradingService.getStrategyById(strategyId);
    const currentConfig =
      strategy.config && typeof strategy.config === 'object'
        ? (strategy.config as Record<string, unknown>)
        : {};
    const currentRisk =
      currentConfig.risk && typeof currentConfig.risk === 'object'
        ? (currentConfig.risk as Record<string, unknown>)
        : {};

    return this.strategiesTradingService.updateStrategy(strategyId, {
      config: {
        ...currentConfig,
        risk: {
          ...currentRisk,
          ...payload,
        },
      },
    });
  }

  async panicStop(
    strategyId: string,
    options?: {
      symbol?: string;
      market?: 'spot' | 'margin';
      strategyType?: string;
    },
  ) {
    let selectedSymbol = options?.symbol;
    let selectedMarket = options?.market;
    let selectedType = options?.strategyType;

    const activeEntry = Array.from(this.activeStrategies.values()).find(
      (strategy) => strategy.id === strategyId,
    );

    if (activeEntry) {
      selectedSymbol = activeEntry.symbol;
      selectedType = activeEntry.constructor.name;
      selectedMarket = /margin/i.test(activeEntry.constructor.name)
        ? 'margin'
        : 'spot';

      await this.stopStrategy(activeEntry.symbol, strategyId);
    }

    if (!selectedSymbol) {
      throw new NotFoundException(
        `No se encontró estrategia activa ${strategyId}. Para pánico manual incluye symbol en la solicitud.`,
      );
    }

    const market =
      selectedMarket ??
      (selectedType && /margin/i.test(selectedType) ? 'margin' : 'spot');

    await this.binanceService.panicLiquidateSymbol({
      strategyId,
      strategyType: selectedType ?? 'manual_panic',
      symbol: selectedSymbol,
      market,
    });

    this.recordDecision(
      selectedSymbol,
      strategyId,
      'PANIC_STOP',
      'manual_panic_stop',
      'ok',
    );
    return {
      strategyId,
      symbol: selectedSymbol,
      market,
      message:
        'Panic stop ejecutado: estrategia detenida y liquidación de emergencia solicitada',
    };
  }

  async updateOrderLevelPrice(
    id: string,
    symbol: string,
    levelIndex: number,
    newPrice: number,
  ) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (isMutableOrderLevelsStrategy(strategy)) {
      await strategy.updateOrderLevelPrice(levelIndex, newPrice);
      return true;
    }
    throw new BadRequestException(
      `La estrategia con id ${id} no soporta actualizar precio de nivel`,
    );
  }

  async removeOrderLevel(id: string, symbol: string, levelIndex: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (isMutableOrderLevelsStrategy(strategy)) {
      await strategy.removeOrderLevel(levelIndex);
      return true;
    }
    throw new BadRequestException(
      `La estrategia con id ${id} no soporta eliminar niveles de orden`,
    );
  }

  addOrderLevel(id: string, symbol: string, orderLevel: OrderLevelDto) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (isMutableOrderLevelsStrategy(strategy)) {
      void (strategy as MutableOrderLevelsStrategy).addOrderLevel(orderLevel);
      return true;
    }
    throw new BadRequestException(
      `La estrategia con id ${id} no soporta agregar niveles de orden`,
    );
  }

  async updateProfitMargin(
    id: string,
    symbol: string,
    newProfitMargin: number,
  ) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new NotFoundException(`Estrategia con id ${id} no encontrada`);
    }
    if (isProfitMarginUpdatableStrategy(strategy)) {
      await (strategy as ProfitMarginUpdatableStrategy).updateProfitMargin(
        newProfitMargin,
      );
      return true;
    }
    throw new BadRequestException(
      `La estrategia con id ${id} no soporta actualización de profit margin`,
    );
  }

  private async ensureStrategyMetadata(
    createTradingStrategyDto: CreateTradingStrategyDto,
  ) {
    try {
      await this.strategiesTradingService.getStrategyById(
        createTradingStrategyDto.id,
      );
      await this.strategiesTradingService.updateStrategy(
        createTradingStrategyDto.id,
        {
          symbol: createTradingStrategyDto.symbol,
          typeId: createTradingStrategyDto.typeId,
          config: createTradingStrategyDto.config,
          strategyType: createTradingStrategyDto.strategyType,
        },
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        await this.strategiesTradingService.createStrategies(
          createTradingStrategyDto,
        );
        return;
      }

      throw error;
    }
  }
}
