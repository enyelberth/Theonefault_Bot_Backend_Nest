import { Injectable, Logger } from '@nestjs/common';
import { BinanceService } from './binance.service';

export interface InterestEntry {
  externalId: string;
  asset: string;
  interest: number;
  interestAccuredTime: Date;
  type: string;
  isolatedSymbol?: string | null;
}

export interface DepositEntry {
  externalId: string;
  amount: number;
  coin: string;
  network?: string;
  status: number;
  insertTime: Date;
  txId?: string;
}

export interface WithdrawalEntry {
  externalId: string;
  amount: number;
  fee: number;
  coin: string;
  network?: string;
  status: number;
  applyTime: Date;
  txId?: string;
}

export interface DividendEntry {
  externalId: string;
  asset: string;
  amount: number;
  divTime: Date;
  enInfo: string;
}

const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class BinanceWalletHistoryService {
  private readonly logger = new Logger(BinanceWalletHistoryService.name);

  constructor(private readonly binance: BinanceService) {}

  async fetchMarginInterest(
    startTimeMs: number,
    endTimeMs: number,
    isolated = false,
  ): Promise<InterestEntry[]> {
    const endpoint = isolated
      ? '/sapi/v1/margin/isolated/interestHistory'
      : '/sapi/v1/margin/interestHistory';
    return this.paginate(startTimeMs, endTimeMs, async (from, to) => {
      const data = await this.binance
        .getSigned(endpoint, { startTime: from, endTime: to, size: 100 })
        .catch((e: any) => {
          this.logger.warn(
            `interestHistory (${isolated ? 'iso' : 'cross'}): ${e?.message ?? e}`,
          );
          return null;
        });
      const rows: any[] = data?.rows ?? [];
      return rows.map((r) => ({
        externalId: `interest:${isolated ? 'iso:' : 'cross:'}${r.txId ?? `${r.asset}:${r.interestAccuredTime}`}`,
        asset: r.asset,
        interest: Number(r.interest),
        interestAccuredTime: new Date(Number(r.interestAccuredTime)),
        type: r.type,
        isolatedSymbol: r.isolatedSymbol ?? null,
      }));
    });
  }

  async fetchDeposits(
    startTimeMs: number,
    endTimeMs: number,
  ): Promise<DepositEntry[]> {
    return this.paginate(startTimeMs, endTimeMs, async (from, to) => {
      const data = await this.binance
        .getSigned('/sapi/v1/capital/deposit/hisrec', {
          startTime: from,
          endTime: to,
          status: 1,
          limit: 1000,
        })
        .catch((e: any) => {
          this.logger.warn(`deposit/hisrec: ${e?.message ?? e}`);
          return null;
        });
      const rows: any[] = Array.isArray(data) ? data : [];
      return rows.map((r) => ({
        externalId: `deposit:${r.id ?? r.txId ?? `${r.coin}:${r.insertTime}`}`,
        amount: Number(r.amount),
        coin: r.coin,
        network: r.network,
        status: Number(r.status),
        insertTime: new Date(Number(r.insertTime)),
        txId: r.txId,
      }));
    });
  }

  async fetchWithdrawals(
    startTimeMs: number,
    endTimeMs: number,
  ): Promise<WithdrawalEntry[]> {
    return this.paginate(startTimeMs, endTimeMs, async (from, to) => {
      const data = await this.binance
        .getSigned('/sapi/v1/capital/withdraw/history', {
          startTime: from,
          endTime: to,
          status: 6,
          limit: 1000,
        })
        .catch((e: any) => {
          this.logger.warn(`withdraw/history: ${e?.message ?? e}`);
          return null;
        });
      const rows: any[] = Array.isArray(data) ? data : [];
      return rows.map((r) => ({
        externalId: `withdrawal:${r.id ?? r.txId ?? `${r.coin}:${r.applyTime}`}`,
        amount: Number(r.amount),
        fee: Number(r.transactionFee ?? 0),
        coin: r.coin,
        network: r.network,
        status: Number(r.status),
        applyTime: new Date(
          r.applyTime ? String(r.applyTime).replace(' ', 'T') : Date.now(),
        ),
        txId: r.txId,
      }));
    });
  }

  async fetchDividends(
    startTimeMs: number,
    endTimeMs: number,
  ): Promise<DividendEntry[]> {
    return this.paginate(startTimeMs, endTimeMs, async (from, to) => {
      const data = await this.binance
        .getSigned('/sapi/v1/asset/assetDividend', {
          startTime: from,
          endTime: to,
          limit: 500,
        })
        .catch((e: any) => {
          this.logger.warn(`assetDividend: ${e?.message ?? e}`);
          return null;
        });
      const rows: any[] = data?.rows ?? [];
      return rows.map((r) => ({
        externalId: `dividend:${r.tranId ?? `${r.asset}:${r.divTime}`}`,
        asset: r.asset,
        amount: Number(r.amount),
        divTime: new Date(Number(r.divTime)),
        enInfo: r.enInfo ?? '',
      }));
    });
  }

  private async paginate<T>(
    startTimeMs: number,
    endTimeMs: number,
    call: (from: number, to: number) => Promise<T[]>,
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor = startTimeMs;
    while (cursor < endTimeMs) {
      const to = Math.min(cursor + MAX_WINDOW_MS, endTimeMs);
      const chunk = await call(cursor, to);
      all.push(...chunk);
      cursor = to + 1;
    }
    return all;
  }
}
