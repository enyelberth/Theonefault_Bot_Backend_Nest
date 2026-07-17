import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateTradingExecutionDto } from './dto/create-trading-execution.dto';

@Injectable()
export class TradingExecutionService {
  constructor(private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.tradingExecution.findMany({
      orderBy: { tradeTimestamp: 'desc' },
    });
  }

  create(dto: CreateTradingExecutionDto) {
    return this.prisma.tradingExecution.create({
      data: {
        orderId: dto.orderId,
        tradePrice: dto.tradePrice,
        tradeQuantity: dto.tradeQuantity,
        tradeTimestamp: new Date(dto.tradeTimestamp),
      },
    });
  }
}
