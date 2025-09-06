import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  PrismaClient,
  StrategyType,
  TradingStrategy,
} from '@prisma/client';
import {
  UpdateStrategyTypeDto,
  UpdateTradingStrategyDto,
} from './dto/update-strategies-trading.dto';
import {
  CreateStrategyTypeDto,
  CreateTradingStrategyDto,
} from './dto/create-strategies-trading.dto';

@Injectable()
export class StrategiesTradingService {
  private readonly logger = new Logger(StrategiesTradingService.name);

  constructor(private readonly prisma: PrismaClient) {}

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

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Ya existe una estrategia con datos únicos duplicados.',
          );
        }
      }
      throw new InternalServerErrorException(
        'Error inesperado al obtener las estrategias de trading.',
      );
    }
  }

  async getStrategyById(id: number): Promise<TradingStrategy> {
    try {
      const strategy = await this.prisma.tradingStrategy.findUnique({
        where: { id },
      });
      if (!strategy) {
        throw new BadRequestException(
          `Estrategia de trading con id ${id} no encontrada.`,
        );
      }
      return strategy;
    } catch (error) {
      this.logger.error(`Error fetching trading strategy with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al obtener la estrategia de trading.',
      );
    }
  }

  async updateStrategy(
    id: number,
    updateTradingStrategyDto: UpdateTradingStrategyDto,
  ): Promise<TradingStrategy> {
    try {
      return await this.prisma.tradingStrategy.update({
        where: { id },
        data: updateTradingStrategyDto,
      });
    } catch (error) {
      this.logger.error(`Error updating strategy with id ${id}`, error);
      throw new InternalServerErrorException(
        'Error inesperado al actualizar la estrategia de trading.',
      );
    }
  }

  async removeStrategy(id: number): Promise<TradingStrategy> {
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

  // Strategy Type
  async getTypeStrategies(): Promise<StrategyType[]> {
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
