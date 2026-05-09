import { Injectable, NotFoundException } from '@nestjs/common';
import { TradingExecution } from '@prisma/client';
import { CreateTradingExecutionDto } from './dto/create-trading-execution.dto';
import { UpdateTradingExecutionDto } from './dto/update-trading-execution.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class TradingExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createTradingExecutionDto: CreateTradingExecutionDto,
  ): Promise<TradingExecution> {
    return this.prisma.tradingExecution.create({
      data: createTradingExecutionDto,
    });
  }

  async findAll(): Promise<TradingExecution[]> {
    return this.prisma.tradingExecution.findMany({
      orderBy: { tradeTimestamp: 'desc' },
    });
  }

  async findOne(id: number): Promise<TradingExecution> {
    const execution = await this.prisma.tradingExecution.findUnique({
      where: { id },
    });
    if (!execution) {
      throw new NotFoundException(`TradingExecution with id ${id} not found`);
    }

    return execution;
  }

  async findByOrderId(orderId: number): Promise<TradingExecution[]> {
    return this.prisma.tradingExecution.findMany({
      where: { orderId },
      orderBy: { tradeTimestamp: 'desc' },
    });
  }

  async update(
    id: number,
    updateTradingExecutionDto: UpdateTradingExecutionDto,
  ): Promise<TradingExecution> {
    await this.findOne(id);
    return this.prisma.tradingExecution.update({
      where: { id },
      data: updateTradingExecutionDto,
    });
  }

  async remove(id: number): Promise<TradingExecution> {
    await this.findOne(id);
    return this.prisma.tradingExecution.delete({ where: { id } });
  }
}
