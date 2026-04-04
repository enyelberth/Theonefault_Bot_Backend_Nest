import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  UpdateStrategyTypeDto,
  UpdateTradingStrategyDto,
} from './dto/update-strategies-trading.dto';
import {
  CreateStrategyTypeDto,
  CreateTradingStrategyDto,
} from './dto/create-strategies-trading.dto';
import { PrismaClient, StrategyType, TradingStrategy } from '@prisma/client';

@Injectable()
export class StrategiesTradingService {
  private readonly logger = new Logger(StrategiesTradingService.name);

  constructor(private readonly prisma: PrismaClient) { }

  private normalizeConfig(config: unknown): Record<string, any> {
    return config && typeof config === 'object' && !Array.isArray(config)
      ? { ...(config as Record<string, any>) }
      : {};
  }

  // Trading Strategy
  async createStrategies(
    createTradingStrategyDto: CreateTradingStrategyDto,
  ): Promise<TradingStrategy> {
    try {
      return await this.prisma.tradingStrategy.create({
        data: createTradingStrategyDto,
      });
    } catch (error) {
      this.logger.error('Error creating trading strategy', error);
      throw new InternalServerErrorException(
        'Error inesperado al crear la estrategia de trading.',
      );
    }
  }

  async getStrategies(): Promise<TradingStrategy[]> {
    try {
      return await this.prisma.tradingStrategy.findMany();
    } catch (error) {
      this.logger.error('Error fetching trading strategies', error);
      if ('code' in error && error.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una estrategia con datos únicos duplicados.',
        );
      }
      throw new InternalServerErrorException(
        'Error inesperado al obtener las estrategias de trading.',
      );
    }
  }

  async getStrategyById(id: string): Promise<TradingStrategy> {
    try {
      const strategy = await this.prisma.tradingStrategy.findUnique({
        where: { id },
      });
      if (!strategy) {
        throw new NotFoundException(
          `Estrategia de trading con id ${id} no encontrada.`,
        );
      }
      return strategy;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(`Error fetching trading strategy with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al obtener la estrategia de trading.',
      );
    }
  }

  async updateStrategy(
    id: string,
    updateTradingStrategyDto: UpdateTradingStrategyDto,
  ): Promise<TradingStrategy> {
    try {
      return await this.prisma.tradingStrategy.update({
        where: { id },
        data: updateTradingStrategyDto,
      });
    } catch (error) {
      if ('code' in error && error.code === 'P2025') {
        throw new NotFoundException(
          `Estrategia de trading con id ${id} no encontrada.`,
        );
      }

      this.logger.error(`Error updating strategy with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al actualizar la estrategia de trading.',
      );
    }
  }

  async removeStrategy(id: string): Promise<TradingStrategy> {
    try {
      return await this.prisma.tradingStrategy.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error deleting strategy with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al eliminar la estrategia de trading.',
      );
    }
  }

  async createVersionSnapshot(id: string, label?: string) {
    const strategy = await this.getStrategyById(id);
    const currentConfig = this.normalizeConfig(strategy.config);
    const snapshotVersion = Number(currentConfig.version ?? 1) + 1;
    const snapshotId = `${id}-snapshot-${Date.now()}`;

    return this.prisma.tradingStrategy.create({
      data: {
        id: snapshotId,
        symbol: strategy.symbol,
        typeId: strategy.typeId,
        strategyType: strategy.strategyType,
        config: {
          ...currentConfig,
          sourceStrategyId: strategy.id,
          snapshotLabel: label ?? `version-${snapshotVersion}`,
          snapshotAt: new Date().toISOString(),
          version: snapshotVersion,
          snapshotOnly: true,
        },
      },
    });
  }

  async setStrategyExecutionMode(id: string, payload: {
    enabled?: boolean;
    paperTrading?: boolean;
    accountId?: number;
    marketScope?: string;
  }) {
    const strategy = await this.getStrategyById(id);
    const currentConfig = this.normalizeConfig(strategy.config);

    return this.prisma.tradingStrategy.update({
      where: { id },
      data: {
        config: {
          ...currentConfig,
          enabled: payload.enabled ?? currentConfig.enabled ?? true,
          paperTrading: payload.paperTrading ?? currentConfig.paperTrading ?? false,
          accountId: payload.accountId ?? currentConfig.accountId ?? null,
          marketScope: payload.marketScope ?? currentConfig.marketScope ?? 'ALL',
          updatedAtRuntime: new Date().toISOString(),
        },
      },
    });
  }

  async getStrategyMetrics(id: string, from?: string, to?: string) {
    const strategy = await this.getStrategyById(id);
    const orders = await this.prisma.tradingOrder.findMany({
      where: {
        symbol: strategy.symbol,
        closed_time: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
        profit_loss: { not: null },
      },
      select: {
        closed_time: true,
        profit_loss: true,
        quantity: true,
      },
      orderBy: { closed_time: 'asc' },
    });

    const pnl = orders.map(item => Number(item.profit_loss ?? 0));
    const wins = pnl.filter(value => value > 0);
    const losses = pnl.filter(value => value < 0);
    const total = pnl.reduce((acc, value) => acc + value, 0);
    const expectancy = pnl.length > 0 ? total / pnl.length : 0;
    const profitFactor = Math.abs(losses.reduce((acc, value) => acc + value, 0)) > 0
      ? wins.reduce((acc, value) => acc + value, 0) / Math.abs(losses.reduce((acc, value) => acc + value, 0))
      : 0;

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const value of pnl) {
      cumulative += value;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
    }

    let avgHoldingMs = 0;
    if (orders.length > 1) {
      const diffs = orders
        .map(item => item.closed_time?.getTime() ?? 0)
        .filter(Boolean)
        .sort((a, b) => a - b)
        .slice(1)
        .map((value, index, array) => value - (orders[index].closed_time?.getTime() ?? value));
      avgHoldingMs = diffs.length > 0 ? diffs.reduce((acc, value) => acc + value, 0) / diffs.length : 0;
    }

    return {
      strategyId: strategy.id,
      symbol: strategy.symbol,
      trades: orders.length,
      winRate: orders.length > 0 ? Number(((wins.length / orders.length) * 100).toFixed(2)) : 0,
      expectancy: Number(expectancy.toFixed(6)),
      maxDrawdown: Number(maxDrawdown.toFixed(6)),
      profitFactor: Number(profitFactor.toFixed(6)),
      avgHoldingMinutes: Number((avgHoldingMs / 60000).toFixed(2)),
      totalPnl: Number(total.toFixed(6)),
    };
  }

  async runBacktestPreview(id: string, from?: string, to?: string, initialCapital = 1000) {
    const metrics = await this.getStrategyMetrics(id, from, to);
    const endingCapital = initialCapital + metrics.totalPnl;

    return {
      strategyId: id,
      from,
      to,
      initialCapital,
      endingCapital,
      returnPct: initialCapital > 0 ? Number((((endingCapital - initialCapital) / initialCapital) * 100).toFixed(4)) : 0,
      metrics,
      note: 'Backtest preview reproducible basado en órdenes históricas del símbolo asociado y snapshot de configuración actual.',
    };
  }

  // Strategy Type
  async getTypeStrategies(): Promise<any> {
    try {
      const types = await this.prisma.strategyType.findMany();
      if (types.length === 0) {
        throw new BadRequestException('No hay tipos de estrategias disponibles.');
      }
      return types;
    } catch (error) {
      this.logger.error('Error fetching strategy types', error);
      throw new InternalServerErrorException(
        'Error inesperado al obtener los tipos de estrategia.',
      );
    }
  }

  async getStrategyTypeById(id: number): Promise<StrategyType> {
    try {
      const type = await this.prisma.strategyType.findUnique({
        where: { id },
      });
      if (!type) {
        throw new BadRequestException(
          `Tipo de estrategia con id ${id} no encontrado.`,
        );
      }
      return type;
    } catch (error) {
      this.logger.error(`Error fetching strategy type with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al obtener el tipo de estrategia.',
      );
    }
  }

  async createTypeStrategy(
    createStrategyTypeDto: CreateStrategyTypeDto,
  ): Promise<StrategyType> {
    try {
      return await this.prisma.strategyType.create({
        data: createStrategyTypeDto,
      });
    } catch (error) {
      this.logger.error('Error creating strategy type', error);
      throw new InternalServerErrorException(
        'Error inesperado al crear el tipo de estrategia.',
      );
    }
  }

  async updateTypeStrategy(
    id: number,
    updateStrategyTypeDto: UpdateStrategyTypeDto,
  ): Promise<StrategyType> {
    try {
      return await this.prisma.strategyType.update({
        where: { id },
        data: updateStrategyTypeDto,
      });
    } catch (error) {
      this.logger.error(`Error updating strategy type with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al actualizar el tipo de estrategia.',
      );
    }
  }

  async removeTypeStrategy(id: number): Promise<StrategyType> {
    try {
      return await this.prisma.strategyType.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error deleting strategy type with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al eliminar el tipo de estrategia.',
      );
    }
  }
}
