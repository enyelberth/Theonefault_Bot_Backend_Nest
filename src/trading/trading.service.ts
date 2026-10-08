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

  constructor(private readonly prisma: PrismaClient) {}

  // --------------------
  // Crear orden
  // --------------------
  async createTradingOrder(
    createTradingDto: CreateTradingOrderDto,
  ): Promise<TradingOrder> {
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

  async createTradingOrderRevers(
    createTradingDtos: CreateTradingOrderDto[],
    client_order_id: string,
  ): Promise<TradingOrder[]> {
    try {
      // Verificar que la orden con client_order_id exista para obtener el side
      const originalOrder = await this.prisma.tradingOrder.findUnique({
        where: { client_order_id },
        select: { side: true },
      });

      if (!originalOrder) {
        throw new BadRequestException(
          'Original order not found for client_order_id: ' + client_order_id,
        );
      }

      // Crear las órdenes relacionadas (posiblemente reversas) en transacción
      await this.prisma.$transaction(async (tx) => {
        await tx.tradingOrder.createMany({
          data: createTradingDtos,
          skipDuplicates: true,
        });
      });

      // Retornar solo las órdenes recién creadas - filtro por client_order_id relacionados (asumiendo que vienen en createTradingDtos)
      const clientOrderIds = createTradingDtos.map(
        (dto) => dto.client_order_id,
      );
      return this.prisma.tradingOrder.findMany({
        where: { client_order_id: { in: clientOrderIds } },
      });
    } catch (error) {
      this.logger.error('Error creating multiple trading orders', error);
      throw new BadRequestException('Error creating multiple trading orders');
    }
  }

  async closeOrder(
    orderId: number,
    closingOrderId: number,
    closedTime: Date,
  ): Promise<any> {
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
  async updateOrderExecution(
    orderId: number,
    executedQuantity: number,
  ): Promise<TradingOrder> {
    const order = await this.prisma.tradingOrder.findUnique({
      where: { id: orderId },
    });
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
    return '';
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
      if (!order)
        throw new NotFoundException(
          `Order with client_order_id ${client_order_id} not found`,
        );
      return order;
    } catch (error) {
      this.logger.error(
        `Error fetching trading order with client_order_id ${client_order_id}`,
        error,
      );
      throw new BadRequestException(
        `Error fetching trading order with client_order_id ${client_order_id}`,
      );
    }
  }
  async searchOrderId(orderId: number): Promise<TradingOrder> {
    try {
      const order = await this.prisma.tradingOrder.findUnique({
        where: { id: orderId },
      });
      if (!order)
        throw new NotFoundException(`Order with id ${orderId} not found`);
      return order;
    } catch (error) {
      this.logger.error(
        `Error fetching trading order with id ${orderId}`,
        error,
      );
      throw new BadRequestException(
        `Error fetching trading order with id ${orderId}`,
      );
    }
  }
  async searchOrdersSymbol(symbol: string): Promise<TradingOrder[]> {
    try {
      const orders = await this.prisma.tradingOrder.findMany({
        where: { symbol },
      });
      if (!orders)
        throw new NotFoundException(`No orders with symbol ${symbol} found`);
      return orders;
    } catch (error) {
      this.logger.error(
        `Error fetching trading orders with symbol ${symbol}`,
        error,
      );
      throw new BadRequestException(
        `Error fetching trading orders with symbol ${symbol}`,
      );
    }
  }
  async searchOrdersStatus(status: OrderStatus): Promise<TradingOrder[]> {
    try {
      const orders = await this.prisma.tradingOrder.findMany({
        where: { status },
      });
      if (!orders)
        throw new NotFoundException(`No orders with status ${status} found`);
      return orders;
    } catch (error) {
      this.logger.error(
        `Error fetching trading orders with status ${status}`,
        error,
      );
      throw new BadRequestException(
        `Error fetching trading orders with status ${status}`,
      );
    }
  }
  async updateTradingOrder(
    id: number,
    updateDto: UpdateTradingOrderDto,
  ): Promise<TradingOrder> {
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

  /**
   * Cancela una orden abierta sin borrar el registro histórico ni sus ejecuciones.
   * El endpoint HTTP se llama DELETE por compatibilidad, pero la operación es
   * deliberadamente un soft-delete para conservar trazabilidad.
   */
  async removeTradingOrder(id: number): Promise<TradingOrder> {
    const order = await this.prisma.tradingOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    if (
      ([OrderStatus.FILLED, OrderStatus.CLOSED] as OrderStatus[]).includes(
        order.status,
      )
    ) {
      throw new BadRequestException(
        `Order ${id} is already ${order.status} and cannot be canceled`,
      );
    }

    return this.prisma.tradingOrder.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELED,
        isWorking: false,
        updatedAt: new Date(),
      },
    });
  }

  // --------------------
  // Actualizar estado orden
  // --------------------

  async updateTradingOrderStatus(
    id: number,
    newStatus: OrderStatus,
    cryptoPrice: number,
  ): Promise<TradingOrder> {
    if (!Number.isFinite(cryptoPrice) || cryptoPrice <= 0) {
      throw new BadRequestException('cryptoPrice inválido');
    }
    if (this.processingPairs.has(id)) {
      throw new ConflictException(`Order ${id} is already being processed`);
    }
    this.processingPairs.add(id);

    try {
      const order = await this.prisma.tradingOrder.findUnique({
        where: { id },
      });
      if (!order) throw new NotFoundException(`Order ${id} not found`);

      if (
        !(
          [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] as OrderStatus[]
        ).includes(order.status)
      ) {
        throw new BadRequestException(
          `Order ${id} cannot transition from ${order.status}`,
        );
      }
      if (
        !([OrderStatus.FILLED, OrderStatus.CANCELED] as OrderStatus[]).includes(
          newStatus,
        )
      ) {
        throw new BadRequestException(`Unsupported target status ${newStatus}`);
      }

      const updateData: Prisma.TradingOrderUpdateInput = {
        status: newStatus,
        isWorking: false,
        updatedAt: new Date(),
      };

      if (newStatus === OrderStatus.FILLED) {
        const execPrice = new Prisma.Decimal(cryptoPrice);
        const referencePrice = order.price
          ? new Prisma.Decimal(order.price)
          : execPrice;
        const quantity = new Prisma.Decimal(order.quantity);
        const profitLoss =
          order.side === OrderSide.BUY
            ? execPrice.minus(referencePrice).times(quantity)
            : referencePrice.minus(execPrice).times(quantity);
        updateData.quantityExecuted = order.quantity;
        updateData.profit_loss = profitLoss;
        updateData.closed_time = new Date();
      }

      return await this.prisma.tradingOrder.update({
        where: { id },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(`Error updating status for order ${id}`, error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new BadRequestException(`Error updating status for order ${id}`);
    } finally {
      this.processingPairs.delete(id);
    }
  }

  async monitorPricesAndCompleteOrders(currentPrice: number) {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new BadRequestException('currentPrice inválido');
    }

    const candidates = await this.prisma.tradingOrder.findMany({
      where: {
        isWorking: true,
        status: { in: [OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const triggered = candidates.filter((order) => {
      const reference =
        order.type === OrderType.STOP_LIMIT ? order.stopPrice : order.price;
      if (reference === null || reference === undefined) return false;
      const price = Number(reference);
      if (!Number.isFinite(price)) return false;
      return order.side === OrderSide.BUY
        ? currentPrice <= price
        : currentPrice >= price;
    });

    const completed: TradingOrder[] = [];
    for (const order of triggered) {
      try {
        completed.push(
          await this.updateTradingOrderStatus(
            order.id,
            OrderStatus.FILLED,
            currentPrice,
          ),
        );
      } catch (error) {
        if (error instanceof ConflictException) continue;
        throw error;
      }
    }

    return {
      currentPrice,
      checked: candidates.length,
      triggered: triggered.length,
      completed,
    };
  }
}
