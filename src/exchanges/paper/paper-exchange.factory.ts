import { Injectable } from '@nestjs/common';
import { BinanceAdapter } from '../adapters/binance.adapter';
import { PaperExchangeAdapter } from './paper-exchange.adapter';
import { PaperAccountService } from './paper-account.service';

@Injectable()
export class PaperExchangeFactory {
  private readonly cache = new Map<number, PaperExchangeAdapter>();

  constructor(
    private readonly reference: BinanceAdapter,
    private readonly accounts: PaperAccountService,
  ) {}

  get(accountId: number): PaperExchangeAdapter {
    const cached = this.cache.get(accountId);
    if (cached) return cached;
    const adapter = new PaperExchangeAdapter(accountId, this.reference, this.accounts);
    this.cache.set(accountId, adapter);
    return adapter;
  }

  invalidate(accountId: number): void {
    this.cache.delete(accountId);
  }
}
