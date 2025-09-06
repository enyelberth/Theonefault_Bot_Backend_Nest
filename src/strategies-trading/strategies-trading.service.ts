import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma, PrismaClient, StrategyType, TradingStrategy } from '@prisma/client';
import { UpdateStrategyTypeDto, UpdateTradingStrategyDto } from './dto/update-strategies-trading.dto';
import { CreateStrategyTypeDto, CreateTradingStrategyDto } from './dto/create-strategies-trading.dto';

@Injectable()
export class StrategiesTradingService {
  private readonly logger = new Logger(StrategiesTradingService.name);

  constructor(private readonly prisma: PrismaClient) { }
  //Strategy Trading
  async createStrategies(createTradingStrategyDto: CreateTradingStrategyDto): Promise<TradingStrategy> {
    try {
      return await this.prisma.tradingStrategy.create({
        data: createTradingStrategyDto,
      });
    } catch (error) {

      this.logger.error('Error creating trading strategy', error);
      throw new InternalServerErrorException('Error creating trading strategy');
    }
  }

  async getStrategies(): Promise<TradingStrategy[]> {
    try {
      const strategies = await this.prisma.tradingStrategy.findMany();
      return strategies;

    } catch (error) {
      this.logger.error('Error fesstching strategies', error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Ya existe una cuenta con esa clave o información única.');
        }
      }
      throw new InternalServerErrorException('Error inesperado al crear la cuenta.');

    }
  }
  async getStrategyById(id: number): Promise<TradingStrategy> {
    try {
      const strategy = await this.prisma.tradingStrategy.findUnique({
        where: { id },
      });
      if (!strategy) {
        throw new BadRequestException(`Estrategia con id ${id} no encontrada.`);
      }
      return strategy;
    } catch (error) {
      this.logger.error(`Error fetching strategy with id ${id}`, error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Ya existe una cuenta con esa clave o información única.');
        }
      }
      throw new InternalServerErrorException('Error inesperado al encontrar la estrategia.');
    }
  }
  async updateStrategy(id: number, updateStrategiesTradingDto: UpdateTradingStrategyDto) {
    try {
      return await this.prisma.tradingStrategy.update({
        where: { id },
        data: updateStrategiesTradingDto,
      });
    } catch (error) {
      this.logger.error(`Error updating trading strategy with id ${id}`, error);
      throw new InternalServerErrorException('Error updating trading strategy');
    }
  }
  async removeStrategy(id: number): Promise<TradingStrategy> {
    try {
      return await this.prisma.tradingStrategy.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error removing trading strategy with id ${id}`, error);
      throw new InternalServerErrorException('Error removing trading strategy');
    }
  }
  //Strategy Type
  async getTypeStrategies(): Promise<StrategyType[]> {
    try {
      return await this.prisma.strategyType.findMany();
    } catch (error) {
      this.logger.error('Error fetching strategy types', error);
      throw new InternalServerErrorException('Error fetching strategy types');
    }
  }
  async getStrategyTypeById(id: number): Promise<StrategyType> {
    try {
      const strategy = await this.prisma.strategyType.findUnique({
        where: { id },
      });
      if (!strategy) {
        throw new BadRequestException(`EstrategiaType con id ${id} no encontrada.`);
      }
      return strategy;
    } catch (error) {
      this.logger.error(`Error fetching strategy with id ${id}`, error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException('Ya existe una cuenta con esa clave o información única.');
        }
      }
      throw new InternalServerErrorException('Error inesperado al encontrar la estrategia.');
    }
  }
  async createTypeStrategy(createTypeStrategyDto: CreateStrategyTypeDto): Promise<StrategyType> {
    try {
      return await this.prisma.strategyType.create({
        data: createTypeStrategyDto,
      });
    } catch (error) {
      this.logger.error('Error creating strategy type', error);
      throw new InternalServerErrorException('Error creating strategy type');
    }
  }

  async updateTypeStrategy(id: number, updateTypeStrategyDto: UpdateStrategyTypeDto): Promise<StrategyType> {
    try {
      return await this.prisma.strategyType.update({
        where: { id },
        data: updateTypeStrategyDto,
      });
    } catch (error) {
      this.logger.error(`Error updating strategy type with id ${id}`, error);
      throw new InternalServerErrorException('Error updating strategy type');
    }
  }

  async removeTypeStrategy(id: number): Promise<StrategyType> {
    try {
      return await this.prisma.strategyType.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Error removing strategy type with id ${id}`, error);
      throw new InternalServerErrorException('Error removing strategy type');
    }
  }


}
