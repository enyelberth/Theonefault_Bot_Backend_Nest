import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, OrderType, OrderSide, OrderStatus } from '@prisma/client';
import { UpdateTradingOrderDto } from './dto/update-tradingOrder.dto';
import { CreateTradingOrderDto } from './dto/create-tradingOrder.dto';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  private readonly priceMargin = 0.0008;
  private readonly sellPriceMargin = 0.0008;
  private readonly counterpartyPercent = 0.0008;

  constructor(private readonly prisma: PrismaClient) {}

  private async descontarSaldo(accountId: number, amount: number, currencyCode: string) {
    const balance = await this.prisma.accountBalance.findUnique({
      where: {
        accountId_currencyCode: { accountId, currencyCode },
      },
    });
    if (!balance || balance.balance.toNumber() < amount) {
      throw new BadRequestException(`Saldo insuficiente para descontar en la moneda ${currencyCode}.`);
    }
    await this.prisma.accountBalance.update({
      where: {
        accountId_currencyCode: { accountId, currencyCode },
      },
      data: {
        balance: balance.balance.toNumber() - amount,
      },
    });
  }

  private async agregarSaldo(accountId: number, amount: number, currencyCode: string) {
    const balance = await this.prisma.accountBalance.findUnique({
      where: {
        accountId_currencyCode: { accountId, currencyCode },
      },
    });
    if (balance) {
      await this.prisma.accountBalance.update({
        where: {
          accountId_currencyCode: { accountId, currencyCode },
        },
        data: {
          balance: balance.balance.toNumber() + amount,
        },
      });
    } else {
      await this.prisma.accountBalance.create({
        data: {
          accountId,
          currencyCode,
          balance: amount,
        },
      });
    }
  }

  async createTradingOrder(createTradingDto: CreateTradingOrderDto, cryptoPrice: number) {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: createTradingDto.accountId },
        include: { accountBalances: true },
      });
      if (!account) {
        throw new NotFoundException(`Cuenta con ID ${createTradingDto.accountId} no encontrada.`);
      }

      const tradingPair = await this.prisma.tradingPair.findUnique({
        where: { id: createTradingDto.tradingPairId },
      });
      if (!tradingPair) {
        throw new NotFoundException(`Par de trading con ID ${createTradingDto.tradingPairId} no encontrado.`);
      }

      if (createTradingDto.orderType == OrderType.MARKET) {
        createTradingDto.price = null;
      } else if ((createTradingDto.orderType == OrderType.LIMIT || createTradingDto.orderType == OrderType.STOP_LIMIT)
                    && (createTradingDto.price == undefined || createTradingDto.price == null)) {
        throw new BadRequestException('El precio es obligatorio para órdenes LIMIT o STOP_LIMIT.');
      }

      if (createTradingDto.orderType == OrderType.LIMIT) {
        if (createTradingDto.side === OrderSide.BUY) {
          const maxAllowedPrice = cryptoPrice * (1 - this.priceMargin);
          if (createTradingDto.price !== null && createTradingDto.price !== undefined && createTradingDto.price >= maxAllowedPrice) {
            throw new BadRequestException(`El precio para orden BUY LIMIT debe ser al menos ${this.priceMargin * 100}% menor que el precio del crypto (${maxAllowedPrice}).`);
          }
        } else if (createTradingDto.side === OrderSide.SELL) {
          const minAllowedPrice = cryptoPrice * (1 + this.sellPriceMargin);
          if (createTradingDto.price !== null && createTradingDto.price !== undefined && createTradingDto.price <= minAllowedPrice) {
            throw new BadRequestException(`El precio para orden SELL LIMIT debe ser al menos ${this.sellPriceMargin * 100}% mayor que el precio del crypto (${minAllowedPrice}).`);
          }
        }
      }

      if (createTradingDto.quantity <= 0) {
        throw new BadRequestException('La cantidad debe ser mayor que cero.');
      }

      let requiredBalance: number;
      let currencyToDebit: string;

      if (createTradingDto.side === OrderSide.BUY) {
        requiredBalance = createTradingDto.quantity * cryptoPrice;
        currencyToDebit = tradingPair.baseCurrencyCode;
      } else {
        requiredBalance = createTradingDto.quantity;
        currencyToDebit = tradingPair.quoteCurrencyCode;
      }

      await this.descontarSaldo(createTradingDto.accountId, requiredBalance, currencyToDebit);

      const newOrder = await this.prisma.tradingOrder.create({
        data: {
          accountId: createTradingDto.accountId,
          tradingPairId: createTradingDto.tradingPairId,
          orderType: createTradingDto.orderType,
          side: createTradingDto.side,
          price: createTradingDto.price,
          quantity: createTradingDto.quantity,
          quantityRemaining: createTradingDto.quantityRemaining,
          status: createTradingDto.status ?? OrderStatus.OPEN,
        },
      });

      return newOrder;
    } catch (error) {
      this.logger.error('Error creando orden de trading', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new ConflictException('Error inesperado al crear la orden de trading.');
    }
  }

async updateOrderStatus(id: number, newStatus: OrderStatus, cryptoPrice: number) {
  const order = await this.prisma.tradingOrder.findUnique({
    where: { id },
    include: { tradingPair: true },
  });
  if (!order) {
    throw new NotFoundException(`Orden con ID ${id} no encontrada.`);
  }

  // Actualizar el estado primero para evitar inconsistencias
  const updatedOrder = await this.prisma.tradingOrder.update({
    where: { id },
    data: { status: newStatus },
  });

  if (newStatus === OrderStatus.CANCELED && order.status !== OrderStatus.CANCELED) {
    const price = order.price ? order.price.toNumber() : cryptoPrice;
    let refundAmount: number;
    let currencyToCredit: string;

    if (order.side === OrderSide.BUY) {
      refundAmount = order.quantity.toNumber() * price;
      currencyToCredit = order.tradingPair.baseCurrencyCode;
    } else {
      refundAmount = order.quantity.toNumber();
      currencyToCredit = order.tradingPair.quoteCurrencyCode;
    }

    await this.agregarSaldo(order.accountId, refundAmount, currencyToCredit);
  }

  if (newStatus === OrderStatus.FILLED && order.status !== OrderStatus.FILLED) {
    let creditAmount: number;
    let currencyToCredit: string;

    if (order.side === OrderSide.BUY) {
      creditAmount = order.quantity.toNumber();
      currencyToCredit = order.tradingPair.quoteCurrencyCode;
    } else {
      creditAmount = order.quantity.toNumber() * (order.price ? order.price.toNumber() : cryptoPrice);
      currencyToCredit = order.tradingPair.baseCurrencyCode;
    }

    await this.agregarSaldo(order.accountId, creditAmount, currencyToCredit);

    // Calcular ganancia basada en variable counterpartyPercent
    // Precio contraparte ajustado para obtener ganancia o pérdida esperada
    const counterpartySide = order.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const priceAdjustment = order.side === OrderSide.BUY
      ? 1 + this.counterpartyPercent  // Contraparte con precio mayor a compra original
      : 1 - this.counterpartyPercent; // Contraparte con precio menor a venta original

    const counterpartyPrice = (order.price ? order.price.toNumber() : cryptoPrice) * priceAdjustment;

    // Crear la orden contraparte con cantidad igual y precio ajustado
    const counterpartyOrder: CreateTradingOrderDto = {
      accountId: order.accountId,
      tradingPairId: order.tradingPairId,
      orderType: order.orderType,
      side: counterpartySide,
      price: counterpartyPrice,
      quantity: order.quantity.toNumber(),
      quantityRemaining: order.quantity.toNumber(),
      status: OrderStatus.OPEN,
    };

    await this.createTradingOrder(counterpartyOrder, cryptoPrice);
  }

  return updatedOrder;
}



  async monitorPricesAndCompleteOrders(currentPrice: number) {
   // console.log("HOLA");
//   console.log(currentPrice*(this.priceMargin+1));
    const openLimitOrders = await this.prisma.tradingOrder.findMany({
      where: {
        status: OrderStatus.OPEN,
        orderType: OrderType.LIMIT,
      },
      include: { tradingPair: true },
    });

    for (const order of openLimitOrders) {
      const orderPrice = order.price?.toNumber();
      if (!orderPrice) continue;

      if (
        (order.side === OrderSide.BUY && currentPrice <= orderPrice) ||
        (order.side === OrderSide.SELL && currentPrice >= orderPrice)
      ) {
        await this.updateOrderStatus(order.id, OrderStatus.FILLED, currentPrice);
      }
    }
  }

  findAllTradingOrders() {
    return this.prisma.tradingOrder.findMany();
  }

  findOneTradingOrder(id: number) {
    return this.prisma.tradingOrder.findUnique({ where: { id } });
  }

  updateTradingOrder(id: number, updateTradingDto: UpdateTradingOrderDto) {
    return this.prisma.tradingOrder.update({
      where: { id },
      data: updateTradingDto,
    });
  }

  removeTradingOrder(id: number) {
    return this.prisma.tradingOrder.delete({ where: { id } });
  }
}
