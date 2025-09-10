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

  async createTradingOrderRevers(createTradingDtos: CreateTradingOrderDto[], client_order_id: string): Promise<TradingOrder[]> {
    try {
      // Verificar que la orden con client_order_id exista para obtener el side
      const originalOrder = await this.prisma.tradingOrder.findUnique({
        where: { client_order_id },
        select: { side: true },
      });

      if (!originalOrder) {
        throw new BadRequestException('Original order not found for client_order_id: ' + client_order_id);
      }

      // Crear las órdenes relacionadas (posiblemente reversas) en transacción
      await this.prisma.$transaction(async (tx) => {
        await tx.tradingOrder.createMany({
          data: createTradingDtos,
          skipDuplicates: true,
        });
      });

      // Retornar solo las órdenes recién creadas - filtro por client_order_id relacionados (asumiendo que vienen en createTradingDtos)
      const clientOrderIds = createTradingDtos.map(dto => dto.client_order_id);
      return this.prisma.tradingOrder.findMany({
        where: { client_order_id: { in: clientOrderIds } },
      });

    } catch (error) {
      this.logger.error('Error creating multiple trading orders', error);
      throw new BadRequestException('Error creating multiple trading orders');
    }
  }

  async closeOrder(orderId: number, closingOrderId: number, closedTime: Date): Promise<any> {
    
        return this.prisma.tradingOrder.update({
        where: { id: orderId },
        data: {
          status: 'CLOSED',
          closingOrderId,
          closed_time: closedTime,
          isWorking: false,
        },
      });
      
  }
  async cancelOrder(orderId: number): Promise<TradingOrder> {
    return this.prisma.tradingOrder.update({
      where: { id: orderId },
      data: {
        status: 'CANCELED',
        isWorking: false,
        updatedAt: new Date(),
      },
    });
  }
  async updateOrderExecution(orderId: number, executedQuantity: number): Promise<TradingOrder> {
    const order = await this.prisma.tradingOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const newQuantityExecuted = order.quantityExecuted.plus(executedQuantity);
    let newStatus = order.status;

    // Cambiar status si se ejecutó cantidad total
    if (newQuantityExecuted.gte(order.quantity)) {
      newStatus = 'FILLED';
    }

    return this.prisma.tradingOrder.update({
      where: { id: orderId },
      data: {
        quantityExecuted: newQuantityExecuted,
        status: newStatus,
        updatedAt: new Date(),
      },
    });
  }
  async getAccountProfitLoss(accountId: number): Promise<any> {
    const result = await this.prisma.tradingOrder.aggregate({
      _sum: { profit_loss: true },
      where: { accountId, profit_loss: { not: null } },
    });

    //return result._sum.profit_loss ?? new Decimal(0);
    return ""
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
  async searchOrderClientId(client_order_id: string): Promise<TradingOrder> {
    try {
      const order = await this.prisma.tradingOrder.findUnique({
        where: { client_order_id },
      });
      if (!order) throw new NotFoundException(`Order with client_order_id ${client_order_id} not found`);
      return order;
    } catch (error) {
      this.logger.error(`Error fetching trading order with client_order_id ${client_order_id}`, error);
      throw new BadRequestException(`Error fetching trading order with client_order_id ${client_order_id}`);
    }
  }
  async searchOrderId(orderId: number): Promise<TradingOrder> {
    try {
      const order = await this.prisma.tradingOrder.findUnique({
        where: { id: orderId },
      });
      if (!order) throw new NotFoundException(`Order with id ${orderId} not found`);
      return order;
    } catch (error) {
      this.logger.error(`Error fetching trading order with id ${orderId}`, error);
      throw new BadRequestException(`Error fetching trading order with id ${orderId}`);
    }
  }
  async searchOrdersSymbol(symbol: string): Promise<TradingOrder[]> {
    try {
      const orders = await this.prisma.tradingOrder.findMany({
        where: { symbol },
      });
      if (!orders) throw new NotFoundException(`No orders with symbol ${symbol} found`);
      return orders;
    } catch (error) {
      this.logger.error(`Error fetching trading orders with symbol ${symbol}`, error);
      throw new BadRequestException(`Error fetching trading orders with symbol ${symbol}`);
    }
  }
  async searchOrdersStatus(status: OrderStatus): Promise<TradingOrder[]> {
    try {
      const orders = await this.prisma.tradingOrder.findMany({
        where: { status },
      });
      if (!orders) throw new NotFoundException(`No orders with status ${status} found`);
      return orders;
    } catch (error) {
      this.logger.error(`Error fetching trading orders with status ${status}`, error);
      throw new BadRequestException(`Error fetching trading orders with status ${status}`);
    }
  }
  async updateTradingOrder(id: number, updateDto: UpdateTradingOrderDto): Promise<TradingOrder> {
    try {
      const existingOrder = await this.prisma.tradingOrder.findUnique({
        where: { id },
      });
      if (!existingOrder) throw new NotFoundException(`Order ${id} not found`);

      const updatedOrder = await this.prisma.tradingOrder.update({
        where: { id },
        data: updateDto,
      });
      return updatedOrder;
    } catch (error) {
      this.logger.error(`Error updating trading order ${id}`, error);
      throw new BadRequestException(`Error updating trading order ${id}`);
    }
  }

  // --------------------
  // Actualizar estado orden
  // --------------------

  async updateTradingOrderStatus(
    id: number,
    newStatus: OrderStatus,
    cryptoPrice: number,
  ): Promise<any> {
    /*
    if (this.processingPairs.has(id)) {
      throw new ConflictException(`Order ${id} is already being processed`);
    }
    this.processingPairs.add(id);

    try {
      const order = await this.prisma.tradingOrder.findUnique({
        where: { id },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);

      // Validar transición de estado
      const validTransitions: Record<OrderStatus, OrderStatus[]> = {
        PENDING: [OrderStatus.FILLED, OrderStatus.CANCELED, OrderStatus.REJECTED],
        FILLED: [],
        CANCELED: [],
        REJECTED: [],
      };
      if (!validTransitions[order.status].includes(newStatus)) {
        throw new BadRequestException(
          `Invalid status transition from ${order.status} to ${newStatus}`,
        );
      }

      // Actualizar estado y calcular ganancias/pérdidas si es necesario
      let updateData: Prisma.TradingOrderUpdateInput = { status: newStatus };

      if (newStatus === OrderStatus.FILLED) {
        const isBuy = order.side === OrderSide.BUY;
        const priceDiff = isBuy
          ? cryptoPrice - Number(order.price)
          : Number(order.price) - cryptoPrice;
        const profitLoss = priceDiff * Number(order.quantity);
        updateData = {
          ...updateData,
          profitLoss,
          completedAt: new Date(),
        };
      }

      const updatedOrder = await this.prisma.tradingOrder.update({
        where: { id },
        data: updateData,
      });
      return updatedOrder;
    } catch (error) {
      this.logger.error(`Error updating status for order ${id}`, error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Error updating status for order ${id}`);
    } finally {
      this.processingPairs.delete(id);
    }
      */
  }
}
