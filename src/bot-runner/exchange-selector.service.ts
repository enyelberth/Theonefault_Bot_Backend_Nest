import { Injectable } from '@nestjs/common';
import { ExchangeFactory } from '../exchanges/exchange.factory';
import { PaperExchangeFactory } from '../exchanges/paper/paper-exchange.factory';
import type { IExchange } from '../exchanges/exchange.interface';

export interface ExchangeSelection {
  mode: 'real' | 'paper';
  exchangeId?: 'binance' | 'bybit' | 'okx' | 'kraken';
  paperAccountId?: number;
}

@Injectable()
export class ExchangeSelector {
  constructor(
    private readonly real: ExchangeFactory,
    private readonly paper: PaperExchangeFactory,
  ) {}

  resolve(selection: ExchangeSelection): IExchange {
    if (selection.mode === 'paper') {
      if (!selection.paperAccountId) {
        throw new Error('paper mode requires paperAccountId');
      }
      return this.paper.get(selection.paperAccountId);
    }
    return this.real.get(selection.exchangeId ?? 'binance');
  }
}
