import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  PrismaClient,
  Prisma,
  OrderType,
  OrderSide,
  OrderStatus,
  TradingOrder,
} from '@prisma/client';
import { UpdateTradingOrderDto } from './dto/update-tradingOrder.dto';
import { CreateTradingOrderDto } from './dto/create-tradingOrder.dto';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private readonly processingPairs = new Set<number>();

  constructor(private readonly prisma: PrismaClient) { }

  // --------------------
  // Crear orden
  // --------------------

  async createTradingOrder(createTradingDto: CreateTradingOrderDto): Promise<TradingOrder> {
    try {
      const order = await this.prisma.tradingOrder.create({
        data: createTradingDto,
      });
      return order;
    } catch (error) {
      this.logger.error('Error creating trading order', error);
      throw new BadRequestException('Error creating trading order');
    }

  }

  async findAllTradingOrders(): Promise<TradingOrder[]> {
    try {
      return this.prisma.tradingOrder.findMany();
    } catch (error) {
      this.logger.error('Error fetching trading orders', error);
      throw new BadRequestException('Error fetching trading orders');
    }
  }

  async findOneTradingOrder(id: number): Promise<TradingOrder> {
    try {
      const order = await this.prisma.tradingOrder.findUnique({
        where: { id },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);
      return order;
    } catch (error) {
      this.logger.error(`Error fetching trading order ${id}`, error);
      throw new BadRequestException(`Error fetching trading order ${id}`);
    }
  }
}
