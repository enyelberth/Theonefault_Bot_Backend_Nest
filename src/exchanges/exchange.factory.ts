import { Injectable } from '@nestjs/common';
import { BinanceAdapter } from './adapters/binance.adapter';
import { ExchangeError } from './exchange.errors';
import { ExchangeId, IExchange } from './exchange.interface';

@Injectable()
export class ExchangeFactory {
  private readonly registry = new Map<ExchangeId, IExchange>();

  constructor(private readonly binance: BinanceAdapter) {
    this.registry.set(binance.id, binance);
  }

  get(id: ExchangeId): IExchange {
    const adapter = this.registry.get(id);
    if (!adapter) {
      throw new ExchangeError(`Exchange "${id}" not registered`, id, 'EXCHANGE_NOT_FOUND');
    }
    return adapter;
  }

  has(id: ExchangeId): boolean {
    return this.registry.has(id);
  }

  list(): IExchange[] {
    return Array.from(this.registry.values());
  }

  register(adapter: IExchange): void {
    this.registry.set(adapter.id, adapter);
  }
}
