import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  PrismaClient,
  OrderStatus,
  TradingOrder,
  Prisma,
} from '@prisma/client';
import { UpdateTradingOrderDto } from './dto/update-tradingOrder.dto';
import { CreateTradingOrderDto } from './dto/create-tradingOrder.dto';
import { SimulateTradingOrderDto } from './dto/simulate-trading-order.dto';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(private readonly prisma: PrismaClient) { }

  private toDecimal(value: Prisma.Decimal | number | string | null | undefined) {
    return new Prisma.Decimal(value ?? 0);
  }

  private toPersistenceInput(createTradingDto: CreateTradingOrderDto) {
    return {
      accountId: createTradingDto.accountId,
      symbol: createTradingDto.symbol,
      orderId: createTradingDto.orderId,
      client_order_id: createTradingDto.paperTrading
        ? `paper:${createTradingDto.client_order_id}`
        : createTradingDto.client_order_id,
      side: createTradingDto.side,
      price: createTradingDto.price,
      quantity: createTradingDto.quantity,
      quantityExecuted: createTradingDto.quantityExecuted,
      status: createTradingDto.status,
      type: createTradingDto.type,
      stopPrice: createTradingDto.stopPrice,
      quantityStop: createTradingDto.quantityStop,
      isWorking: createTradingDto.isWorking,
      closingOrderId: createTradingDto.closingOrderId,
      profit_loss: createTradingDto.profit_loss,
    };
  }

  private async evaluateOrderGuardrails(input: {
    accountId: number;
    symbol: string;
    quantity: number;
    price?: number | null;
    maxDailyLoss?: number;
    maxDrawdown?: number;
    maxSymbolExposure?: number;
    allowedFromHourUtc?: number;
    allowedToHourUtc?: number;
  }) {
    const now = new Date();
    const hour = now.getUTCHours();
    const fromHour = input.allowedFromHourUtc;
    const toHour = input.allowedToHourUtc;

    if (
      Number.isInteger(fromHour) &&
      Number.isInteger(toHour) &&
      (hour < Number(fromHour) || hour > Number(toHour))
    ) {
      return {
        allowed: false,
        code: 'TRADING_WINDOW_CLOSED',
        message: `Fuera de horario permitido UTC ${fromHour}-${toHour}. Hora actual: ${hour}.`,
      };
    }

    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    const [dayOrders, symbolOrders] = await Promise.all([
      this.prisma.tradingOrder.findMany({
        where: {
          accountId: input.accountId,
          closed_time: { gte: dayStart },
          profit_loss: { not: null },
        },
        select: { profit_loss: true },
      }),
      this.prisma.tradingOrder.findMany({
        where: {
          accountId: input.accountId,
          symbol: input.symbol,
          status: { in: ['OPEN', 'PARTIALLY_FILLED', 'FILLED'] },
        },
        select: { quantity: true, price: true },
      }),
    ]);

    const dailyPnl = dayOrders.reduce(
      (acc, order) => acc.plus(this.toDecimal(order.profit_loss)),
      new Prisma.Decimal(0),
    );

    let cumulative = new Prisma.Decimal(0);
    let peak = new Prisma.Decimal(0);
    let maxDrawdown = new Prisma.Decimal(0);
    for (const order of dayOrders) {
      cumulative = cumulative.plus(this.toDecimal(order.profit_loss));
      if (cumulative.gt(peak)) {
        peak = cumulative;
      }
      const drawdown = peak.minus(cumulative);
      if (drawdown.gt(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }

    const currentExposure = symbolOrders.reduce(
      (acc, order) => acc.plus(this.toDecimal(order.quantity).mul(this.toDecimal(order.price ?? 1))),
      new Prisma.Decimal(0),
    );
    const incomingExposure = this.toDecimal(input.quantity).mul(this.toDecimal(input.price ?? 1));
    const projectedExposure = currentExposure.plus(incomingExposure);

    if (input.maxDailyLoss !== undefined && dailyPnl.lte(new Prisma.Decimal(input.maxDailyLoss).mul(-1))) {
      return {
        allowed: false,
        code: 'MAX_DAILY_LOSS_REACHED',
        message: `Límite de pérdida diaria alcanzado. PnL diario=${dailyPnl.toString()}`,
      };
    }

    if (input.maxDrawdown !== undefined && maxDrawdown.gte(this.toDecimal(input.maxDrawdown))) {
      return {
        allowed: false,
        code: 'MAX_DRAWDOWN_REACHED',
        message: `Drawdown máximo excedido. Actual=${maxDrawdown.toString()}`,
      };
    }

    if (input.maxSymbolExposure !== undefined && projectedExposure.gt(this.toDecimal(input.maxSymbolExposure))) {
      return {
        allowed: false,
        code: 'MAX_SYMBOL_EXPOSURE_REACHED',
        message: `Exposición proyectada ${projectedExposure.toString()} excede el máximo permitido.`,
      };
    }

    return {
      allowed: true,
      code: 'OK',
      message: 'La orden cumple reglas de horario y riesgo.',
      diagnostics: {
        dailyPnl: dailyPnl.toString(),
        maxDrawdown: maxDrawdown.toString(),
        currentExposure: currentExposure.toString(),
        projectedExposure: projectedExposure.toString(),
      },
    };
  }

  // --------------------
  // Crear orden
  // --------------------
  async createTradingOrder(createTradingDto: CreateTradingOrderDto): Promise<TradingOrder> {
    try {
      const riskCheck = await this.evaluateOrderGuardrails(createTradingDto);
      if (!riskCheck.allowed) {
        throw new BadRequestException(riskCheck.message);
      }

      const order = await this.prisma.tradingOrder.create({
        data: this.toPersistenceInput(createTradingDto),
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

  async closeOrder(orderId: number, closingOrderId: number, closedTime: Date): Promise<TradingOrder> {
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
  async getAccountProfitLoss(accountId: number): Promise<string> {
    const result = await this.prisma.tradingOrder.aggregate({
      _sum: { profit_loss: true },
      where: { accountId, profit_loss: { not: null } },
    });

    return result._sum.profit_loss?.toString() ?? '0';
  }

  async simulateTradingOrder(simulateDto: SimulateTradingOrderDto) {
    const riskCheck = await this.evaluateOrderGuardrails(simulateDto);
    const notional = this.toDecimal(simulateDto.quantity).mul(this.toDecimal(simulateDto.price ?? 1));

    return {
      ok: riskCheck.allowed,
      code: riskCheck.code,
      message: riskCheck.message,
      preview: {
        accountId: simulateDto.accountId,
        symbol: simulateDto.symbol,
        side: simulateDto.side,
        type: simulateDto.type,
        quantity: simulateDto.quantity,
        price: simulateDto.price ?? null,
        estimatedNotional: notional.toString(),
        paperTrading: simulateDto.paperTrading ?? false,
        decisionReason: simulateDto.decisionReason ?? null,
      },
      diagnostics: riskCheck.diagnostics ?? null,
    };
  }

  async getTradingDiagnostics(accountId?: number) {
    const where = accountId ? { accountId } : {};
    const [orders, pnlAgg] = await Promise.all([
      this.prisma.tradingOrder.groupBy({
        by: ['status', 'symbol'],
        where,
        _count: { id: true },
        _sum: { profit_loss: true, quantity: true },
      }),
      this.prisma.tradingOrder.aggregate({
        where: {
          ...where,
          profit_loss: { not: null },
        },
        _sum: { profit_loss: true },
        _count: { id: true },
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      accountId: accountId ?? null,
      totals: {
        orders: pnlAgg._count.id,
        realizedPnl: pnlAgg._sum.profit_loss?.toString() ?? '0',
      },
      bySymbolAndStatus: orders.map(item => ({
        symbol: item.symbol,
        status: item.status,
        count: item._count.id,
        quantity: item._sum.quantity?.toString() ?? '0',
        profitLoss: item._sum.profit_loss?.toString() ?? '0',
      })),
    };
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
  ): Promise<never> {
    void id;
    void newStatus;
    void cryptoPrice;
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
    throw new BadRequestException('updateTradingOrderStatus no está implementado para el modelo actual de órdenes.');
  }
}
