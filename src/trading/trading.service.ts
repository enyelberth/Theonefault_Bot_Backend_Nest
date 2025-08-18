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
} from '@prisma/client';
import { UpdateTradingOrderDto } from './dto/update-tradingOrder.dto';
import { CreateTradingOrderDto } from './dto/create-tradingOrder.dto';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private readonly processingPairs = new Set<number>();

  constructor(private readonly prisma: PrismaClient) {}

  // --------------------
  // Utils
  // --------------------
  private dec(n: number | Prisma.Decimal) {
    return new Prisma.Decimal(n);
  }

  // --------------------
  // Helpers de balance (ATÓMICOS)
  // --------------------
  private async descontarSaldo(
    tx: Prisma.TransactionClient,
    accountId: number,
    amount: number,
    currencyCode: string,
  ) {
    const amt = this.dec(amount);
    if (amt.lte(0)) return;

    const { count } = await tx.accountBalance.updateMany({
      where: {
        AND: [
          { accountId },
          { currencyCode },
          { balance: { gte: amt } },
        ],
      },
      data: {
        balance: { decrement: amt },
      },
    });

    if (count === 0)
      throw new BadRequestException(`Saldo insuficiente en ${currencyCode}.`);
  }

  private async agregarSaldo(
    tx: Prisma.TransactionClient,
    accountId: number,
    amount: number,
    currencyCode: string,
  ) {
    const amt = this.dec(amount);
    if (amt.lte(0)) return;

    const existing = await tx.accountBalance.findFirst({
      where: { accountId, currencyCode },
    });

    if (existing) {
      await tx.accountBalance.update({
        where: { id: existing.id },
        data: { balance: { increment: amt } },
      });
    } else {
      await tx.accountBalance.create({
        data: {
          accountId,
          currencyCode,
          balance: amt,
        },
      });
    }
  }

  // --------------------
  // Crear orden
  // --------------------
  async createTradingOrder(
    createTradingDto: CreateTradingOrderDto,
    cryptoPrice: number,
  ) {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id: createTradingDto.accountId },
      });
      if (!account)
        throw new NotFoundException(
          `Cuenta ${createTradingDto.accountId} no encontrada`,
        );

      const tradingPair = await this.prisma.tradingPair.findUnique({
        where: { id: createTradingDto.tradingPairId },
      });
      if (!tradingPair)
        throw new NotFoundException(
          `Par ${createTradingDto.tradingPairId} no encontrado`,
        );

      if (createTradingDto.orderType === OrderType.MARKET) {
        createTradingDto.price = null;
      } else if (
        (createTradingDto.orderType === OrderType.LIMIT ||
          createTradingDto.orderType === OrderType.STOP_LIMIT) &&
        createTradingDto.price == null
      ) {
        throw new BadRequestException(
          'El precio es obligatorio para LIMIT o STOP_LIMIT.',
        );
      }

      if (createTradingDto.quantity <= 0)
        throw new BadRequestException('Cantidad debe ser mayor que cero.');

      const effectivePrice =
        createTradingDto.orderType === OrderType.MARKET
          ? cryptoPrice
          : (createTradingDto.price as number);

      const qtyDec = this.dec(createTradingDto.quantity);
      const priceDec = this.dec(effectivePrice);

      let requiredBalance: Prisma.Decimal;
      let currencyToDebit: string;

      if (createTradingDto.side === OrderSide.BUY) {
        requiredBalance = qtyDec.mul(priceDec);
        currencyToDebit = tradingPair.quoteCurrencyCode;
      } else {
        requiredBalance = qtyDec; // vender requiere tener la base
        currencyToDebit = tradingPair.baseCurrencyCode;
      }

      return await this.prisma.$transaction(async (tx) => {
        await this.descontarSaldo(
          tx,
          createTradingDto.accountId,
          Number(requiredBalance),
          currencyToDebit,
        );

        return tx.tradingOrder.create({
          data: {
            accountId: createTradingDto.accountId,
            tradingPairId: createTradingDto.tradingPairId,
            orderType: createTradingDto.orderType,
            side: createTradingDto.side,
            price:
              createTradingDto.price != null
                ? this.dec(createTradingDto.price)
                : null,
            quantity: qtyDec,
            quantityRemaining:
              createTradingDto.quantityRemaining != null
                ? this.dec(createTradingDto.quantityRemaining)
                : qtyDec,
            status: createTradingDto.status ?? OrderStatus.OPEN,
          },
        });
      });
    } catch (error) {
      this.logger.error('Error creando orden', error?.stack || error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      )
        throw error;
      throw new ConflictException('Error inesperado al crear la orden.');
    }
  }

  // --------------------
  // Lógica de llenado interno
  // --------------------
  private async fillOrderTx(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      accountId: number;
      side: OrderSide;
      price: Prisma.Decimal | null;
      quantity: Prisma.Decimal;
      tradingPair: { baseCurrencyCode: string; quoteCurrencyCode: string };
    },
    currentPrice: number,
  ) {
    const fillPrice = this.dec(currentPrice);
    const qty = this.dec(order.quantity);

    if (order.side === OrderSide.BUY) {
      const actualCost = qty.mul(fillPrice);

      if (order.price) {
        const reserved = qty.mul(order.price);
        const refund = reserved.sub(actualCost);
        if (refund.gt(0)) {
          await this.agregarSaldo(
            tx,
            order.accountId,
            Number(refund),
            order.tradingPair.quoteCurrencyCode,
          );
        }
      }

      await this.agregarSaldo(
        tx,
        order.accountId,
        Number(qty),
        order.tradingPair.baseCurrencyCode,
      );
    } else {
      const proceeds = qty.mul(fillPrice);
      await this.agregarSaldo(
        tx,
        order.accountId,
        Number(proceeds),
        order.tradingPair.quoteCurrencyCode,
      );
    }

    // Actualizar orden dentro de la transacción usando tx
    await tx.tradingOrder.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.FILLED,
        quantityRemaining: this.dec(0),
      },
    });
  }

  // --------------------
  // Procesar tick de precio
  // --------------------
  async processPriceTick(tradingPairId: number, currentPrice: number) {
    if (this.processingPairs.has(tradingPairId)) return;
    this.processingPairs.add(tradingPairId);

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const ordersToFill = await tx.tradingOrder.findMany({
            where: {
              tradingPairId,
              status: OrderStatus.OPEN,
              OR: [
                { orderType: OrderType.MARKET },
                {
                  AND: [
                    { orderType: OrderType.LIMIT },
                    { side: OrderSide.BUY },
                    { price: { gte: currentPrice } },
                  ],
                },
                {
                  AND: [
                    { orderType: OrderType.LIMIT },
                    { side: OrderSide.SELL },
                    { price: { lte: currentPrice } },
                  ],
                },
              ],
            },
            include: {
              tradingPair: {
                select: {
                  baseCurrencyCode: true,
                  quoteCurrencyCode: true,
                },
              },
            },
            orderBy: { id: 'asc' },
            take: 200,
          });

          for (const order of ordersToFill) {
            await this.fillOrderTx(tx, order, currentPrice);
          }
        },
        {
          maxWait: 5000,
          timeout: 20000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );
    } finally {
      this.processingPairs.delete(tradingPairId);
    }
  }

  // --------------------
  // CRUD básico
  // --------------------
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
