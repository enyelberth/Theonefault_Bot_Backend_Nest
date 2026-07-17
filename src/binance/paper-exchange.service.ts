import { Injectable, Logger } from '@nestjs/common';
import {
  OrderSide,
  PaperOrder,
  PaperOrderStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import axios from 'axios';
import { BinanceService } from './binance.service';

/**
 * Exchange simulado que extiende BinanceService.
 * Reads (precio, filtros, velas, tick size) delegan al real.
 * Writes (crear/cancelar/consultar orden) → tabla PaperOrder + matching por precio spot.
 */
@Injectable()
export class PaperExchangeService extends BinanceService {
  private readonly paperLogger = new Logger(PaperExchangeService.name);
  private currentBotRunId: number | null = null;
  private orderIdCounter = Date.now();

  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  setBotRunId(botRunId: number | null): void {
    this.currentBotRunId = botRunId;
  }

  private nextOrderId(): string {
    this.orderIdCounter += 1;
    return String(this.orderIdCounter);
  }

  private async getSpotPrice(symbol: string): Promise<number> {
    const resp = await super.getSymbolPrice(symbol);
    return parseFloat(resp.price);
  }

  private normalizeStatus(status: PaperOrderStatus): string {
    return status; // OPEN / FILLED / CANCELED
  }

  private toBinanceLikeOrder(order: PaperOrder) {
    return {
      orderId: order.externalId,
      clientOrderId: `paper-${order.externalId}`,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      status: this.normalizeStatus(order.status),
      price: order.price?.toString() ?? '0',
      origQty: order.quantity.toString(),
      executedQty:
        order.status === PaperOrderStatus.FILLED
          ? order.quantity.toString()
          : '0',
      avgPrice:
        order.status === PaperOrderStatus.FILLED
          ? order.filledPrice?.toString() ?? order.price?.toString()
          : undefined,
      stopPrice: order.stopPrice?.toString(),
      updateTime: order.updatedAt.getTime(),
      time: order.createdAt.getTime(),
      isWorking: order.status === PaperOrderStatus.OPEN,
    };
  }

  private async createPaperOrder(input: {
    symbol: string;
    side: OrderSide;
    type: string;
    price?: string;
    stopPrice?: string;
    quantity: string;
  }): Promise<PaperOrder> {
    const externalId = this.nextOrderId();
    const order = await this.prisma.paperOrder.create({
      data: {
        botRunId: this.currentBotRunId,
        externalId,
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        price: input.price ? new Prisma.Decimal(input.price) : undefined,
        stopPrice: input.stopPrice
          ? new Prisma.Decimal(input.stopPrice)
          : undefined,
        quantity: new Prisma.Decimal(input.quantity),
        status: PaperOrderStatus.OPEN,
      },
    });
    this.paperLogger.log(
      `[PAPER] CREATE ${input.side} ${input.type} ${input.symbol} qty=${input.quantity} price=${input.price ?? 'market'} id=${externalId}`,
    );
    return order;
  }

  private async matchIfPossible(order: PaperOrder): Promise<PaperOrder> {
    if (order.status !== PaperOrderStatus.OPEN) return order;
    let filledPrice: number | null = null;

    try {
      const spot = await this.getSpotPrice(order.symbol);

      if (order.type === 'MARKET') {
        filledPrice = spot;
      } else if (order.type === 'LIMIT') {
        const p = order.price ? Number(order.price) : null;
        if (p !== null) {
          if (order.side === OrderSide.BUY && spot <= p) filledPrice = p;
          else if (order.side === OrderSide.SELL && spot >= p) filledPrice = p;
        }
      } else if (order.type === 'STOP_LOSS' || order.type === 'STOP_LOSS_LIMIT') {
        const stop = order.stopPrice ? Number(order.stopPrice) : null;
        if (stop !== null) {
          if (order.side === OrderSide.SELL && spot <= stop) filledPrice = order.price ? Number(order.price) : spot;
          else if (order.side === OrderSide.BUY && spot >= stop) filledPrice = order.price ? Number(order.price) : spot;
        }
      }
    } catch (err) {
      this.paperLogger.warn(`Match spot fetch fail: ${(err as Error).message}`);
    }

    if (filledPrice === null) return order;

    const updated = await this.prisma.paperOrder.update({
      where: { id: order.id },
      data: {
        status: PaperOrderStatus.FILLED,
        filledPrice: new Prisma.Decimal(filledPrice),
        filledAt: new Date(),
      },
    });
    this.paperLogger.log(
      `[PAPER] FILL ${updated.side} ${updated.symbol} @ ${filledPrice} id=${updated.externalId}`,
    );
    return updated;
  }

  // ==================== SPOT ====================

  async createLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    _timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
  ) {
    const order = await this.createPaperOrder({
      symbol,
      side: side as OrderSide,
      type: 'LIMIT',
      price,
      quantity,
    });
    return this.toBinanceLikeOrder(order);
  }

  async createMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
  ) {
    const order = await this.createPaperOrder({
      symbol,
      side: side as OrderSide,
      type: 'MARKET',
      quantity,
    });
    const filled = await this.matchIfPossible(order);
    return this.toBinanceLikeOrder(filled);
  }

  async createStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {},
  ) {
    const limitPrice = options?.price ?? options?.limitPrice;
    const order = await this.createPaperOrder({
      symbol,
      side: side as OrderSide,
      type: limitPrice ? 'STOP_LOSS_LIMIT' : 'STOP_LOSS',
      price: limitPrice,
      stopPrice,
      quantity,
    });
    return this.toBinanceLikeOrder(order);
  }

  async createOcoOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    stopPrice: string,
    stopLimitPrice: string,
  ) {
    // Modelo OCO simulado: crea 2 órdenes
    const limit = await this.createPaperOrder({
      symbol,
      side: side as OrderSide,
      type: 'LIMIT',
      price,
      quantity,
    });
    const stop = await this.createPaperOrder({
      symbol,
      side: side as OrderSide,
      type: 'STOP_LOSS_LIMIT',
      price: stopLimitPrice,
      stopPrice,
      quantity,
    });
    return {
      orderListId: this.nextOrderId(),
      contingencyType: 'OCO',
      orders: [
        this.toBinanceLikeOrder(limit),
        this.toBinanceLikeOrder(stop),
      ],
    };
  }

  async checkOrderStatus(symbol: string, orderId: number | string) {
    const paper = await this.prisma.paperOrder.findUnique({
      where: { externalId: String(orderId) },
    });
    if (!paper) {
      throw new Error(`Paper order not found: ${orderId}`);
    }
    const matched = await this.matchIfPossible(paper);
    return this.toBinanceLikeOrder(matched);
  }

  async cancelOrder(symbol: string, orderId?: number | string) {
    if (orderId !== undefined) {
      const paper = await this.prisma.paperOrder.findUnique({
        where: { externalId: String(orderId) },
      });
      if (!paper) throw new Error(`Paper order not found: ${orderId}`);
      const canceled = await this.prisma.paperOrder.update({
        where: { id: paper.id },
        data: { status: PaperOrderStatus.CANCELED },
      });
      return this.toBinanceLikeOrder(canceled);
    }
    // cancelar todas del símbolo
    const orders = await this.prisma.paperOrder.findMany({
      where: { symbol, status: PaperOrderStatus.OPEN },
    });
    await this.prisma.paperOrder.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: PaperOrderStatus.CANCELED },
    });
    return { canceled: orders.length };
  }

  async getAllOrders(symbol: string, limit = 500) {
    const paper = await this.prisma.paperOrder.findMany({
      where: { symbol },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return paper.map((o) => this.toBinanceLikeOrder(o));
  }

  // ==================== MARGIN (mismo simulador) ====================

  async createCrossMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
  ) {
    return this.createLimitOrder(symbol, side, quantity, price, timeInForce);
  }

  async checkCrossMarginOrderStatus(symbol: string, orderId: number | string) {
    return this.checkOrderStatus(symbol, orderId);
  }

  async cancelCrossMarginOrder(symbol: string, orderId: number | string) {
    return this.cancelOrder(symbol, orderId);
  }

  async getAllCrossMarginOrders(symbol: string, limit = 500) {
    return this.getAllOrders(symbol, limit);
  }
}
