import { Injectable, Logger } from '@nestjs/common';
import { CopyMode, CopySubscription } from '@prisma/client';
import type { IExchange } from '../exchanges/exchange.interface';
import type { Signal } from '../exchanges/domain';
import { ExchangeSelector } from '../bot-runner/exchange-selector.service';
import { CopyTradingRepository } from './copy-trading.repository';

export interface DispatchInput {
  copyEventId: number;
  masterRunId: string;
  masterEquity: number;
  signal: Signal;
  subscription: CopySubscription;
}

export interface DispatchResult {
  status: 'FILLED' | 'REJECTED' | 'ERROR';
  reason?: string;
  orderId?: string;
  price?: number;
  quantity?: number;
  quoteQuantity?: number;
}

@Injectable()
export class CopyExecutorService {
  private readonly logger = new Logger(CopyExecutorService.name);

  constructor(
    private readonly selector: ExchangeSelector,
    private readonly repo: CopyTradingRepository,
  ) {}

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const { signal, subscription: sub, masterEquity, copyEventId } = input;
    let result: DispatchResult;
    try {
      const exchange = this.selector.resolve({
        mode: sub.exchangeMode as 'real' | 'paper',
        exchangeId: sub.exchangeId as any,
        paperAccountId: sub.paperAccountId ?? undefined,
      });

      if (signal.action === 'CANCEL_ALL') {
        await exchange.cancelAllOrders(signal.symbol).catch(() => 0);
        result = { status: 'FILLED', reason: 'CANCEL_ALL' };
      } else if (!signal.side || !signal.type) {
        result = { status: 'REJECTED', reason: 'signal missing side/type' };
      } else {
        const sized = await this.computeSize(exchange, signal, sub, masterEquity);
        if (!sized) {
          result = { status: 'REJECTED', reason: 'sizing produced zero quantity' };
        } else {
          const order = await exchange.placeOrder({
            symbol: signal.symbol,
            side: signal.side,
            type: signal.type,
            quantity: sized.quantity,
            quoteQuantity: sized.quoteQuantity,
            price: signal.price,
            stopPrice: signal.stopPrice,
            timeInForce: signal.timeInForce,
            market: signal.market,
            clientOrderId: `copy-${copyEventId}-${sub.id}`,
          });
          result = {
            status: 'FILLED',
            orderId: order.id,
            price: order.averagePrice || order.price,
            quantity: order.filledQuantity || order.quantity,
            quoteQuantity: order.quoteQuantity,
          };
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`dispatch sub=${sub.id}: ${msg}`);
      result = { status: 'ERROR', reason: msg };
    }

    await this.repo
      .recordExecution({
        copyEventId,
        subscriptionId: sub.id,
        status: result.status,
        reason: result.reason,
        orderId: result.orderId,
        price: result.price,
        quantity: result.quantity,
        quoteQuantity: result.quoteQuantity,
      })
      .catch((e) => this.logger.warn(`recordExecution: ${(e as Error).message}`));

    return result;
  }

  private async computeSize(
    exchange: IExchange,
    signal: Signal,
    sub: CopySubscription,
    masterEquity: number,
  ): Promise<{ quantity?: number; quoteQuantity?: number } | null> {
    const mult = sub.sizeMultiplier ?? 1;
    let quantity = signal.quantity;
    let quoteQuantity = signal.quoteQuantity;

    if (sub.mode === CopyMode.FIXED_QUOTE) {
      if (!sub.fixedQuote || sub.fixedQuote <= 0) return null;
      quantity = undefined;
      quoteQuantity = sub.fixedQuote;
    } else if (sub.mode === CopyMode.PROPORTIONAL) {
      const followerEquity = await this.readEquity(exchange);
      if (masterEquity <= 0 || followerEquity <= 0) return null;
      const ratio = (followerEquity / masterEquity) * mult;
      if (quantity !== undefined) quantity = quantity * ratio;
      if (quoteQuantity !== undefined) quoteQuantity = quoteQuantity * ratio;
    } else {
      if (quantity !== undefined) quantity = quantity * mult;
      if (quoteQuantity !== undefined) quoteQuantity = quoteQuantity * mult;
    }

    if (sub.maxRiskPct && sub.maxRiskPct > 0) {
      const followerEquity = await this.readEquity(exchange);
      const cap = followerEquity * (sub.maxRiskPct / 100);
      if (quoteQuantity !== undefined && quoteQuantity > cap) quoteQuantity = cap;
      if (quantity !== undefined && signal.price && quantity * signal.price > cap) {
        quantity = cap / signal.price;
      }
    }

    const q = quantity ?? 0;
    const qq = quoteQuantity ?? 0;
    if (q <= 0 && qq <= 0) return null;
    return { quantity, quoteQuantity };
  }

  private async readEquity(exchange: IExchange): Promise<number> {
    const balance = await exchange.getBalance('SPOT').catch(() => null);
    if (!balance) return 0;
    if (balance.totalValueUsd !== undefined) return balance.totalValueUsd;
    return balance.balances.reduce((a, b) => a + b.total, 0);
  }
}
