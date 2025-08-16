import { Injectable, Logger } from '@nestjs/common';
import { CreateTradingDto } from './dto/create-trading.dto';
import { UpdateTradingDto } from './dto/update-trading.dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  constructor(private readonly prisma: PrismaClient) {}

  createTradingOrder(createTradingDto: CreateTradingDto) {
   // return this.prisma.tradingOrder.create({ data: createTradingDto });
  }

  findAllTradingOrders() {
    return this.prisma.tradingOrder.findMany();
  }

  findOneTradingOrder(id: number) {
    return this.prisma.tradingOrder.findUnique({ where: { id } });
  }

  updateTradingOrder(id: number, updateTradingDto: UpdateTradingDto) {
    return this.prisma.tradingOrder.update({
      where: { id },
      data: updateTradingDto,
    });
  }

  removeTradingOrder(id: number) {
    return this.prisma.tradingOrder.delete({ where: { id } });
  }
}
