import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import { BinanceWalletHistoryService } from '../binance/binance-wallet-history.service';
import { envConfig } from '../config/env.config';
import {
  CapitalEventType,
  CapitalLedgerService,
} from './capital-ledger.service';

const SOURCE = 'binance';
const INITIAL_WINDOW_DAYS = 30;

@Injectable()
export class WalletSyncService {
  private readonly logger = new Logger(WalletSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly ledger: CapitalLedgerService,
    private readonly walletHistory: BinanceWalletHistoryService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cronSync(): Promise<void> {
    const env = envConfig();
    if (!env.binance.apiKey || !env.binance.apiSecret) {
      this.logger.debug('wallet sync skipped: no binance credentials');
      return;
    }
    if (this.running) return;
    this.running = true;
    try {
      await this.syncAll();
    } catch (e: any) {
      this.logger.warn(`wallet sync failed: ${e?.message ?? e}`);
    } finally {
      this.running = false;
    }
  }

  async syncAll(now = Date.now()): Promise<{
    interest: number;
    deposits: number;
    withdrawals: number;
    rebates: number;
    funding: number;
  }> {
    const [interest, deposits, withdrawals, rebates, funding] =
      await Promise.all([
        this.syncInterest(now),
        this.syncDeposits(now),
        this.syncWithdrawals(now),
        this.syncRebates(now),
        this.syncFunding(now),
      ]);
    if (interest + deposits + withdrawals + rebates + funding > 0) {
      this.logger.log(
        `wallet sync: interest=${interest} deposits=${deposits} withdrawals=${withdrawals} rebates=${rebates} funding=${funding}`,
      );
    }
    return { interest, deposits, withdrawals, rebates, funding };
  }

  private async syncInterest(now: number): Promise<number> {
    const since = await this.lastOccurred('INTEREST', now);
    const [cross, iso] = await Promise.all([
      this.walletHistory.fetchMarginInterest(since, now, false).catch(() => []),
      this.walletHistory.fetchMarginInterest(since, now, true).catch(() => []),
    ]);
    return this.ledger.recordMany(
      [...cross, ...iso].map((r) => ({
        type: 'INTEREST' as CapitalEventType,
        amount: -Math.abs(r.interest),
        currency: r.asset,
        source: SOURCE,
        externalId: r.externalId,
        occurredAt: r.interestAccuredTime,
        payload: { type: r.type, isolatedSymbol: r.isolatedSymbol },
      })),
    );
  }

  private async syncDeposits(now: number): Promise<number> {
    const since = await this.lastOccurred('DEPOSIT', now);
    const rows = await this.walletHistory
      .fetchDeposits(since, now)
      .catch(() => []);
    return this.ledger.recordMany(
      rows.map((r) => ({
        type: 'DEPOSIT' as CapitalEventType,
        amount: Math.abs(r.amount),
        currency: r.coin,
        source: SOURCE,
        externalId: r.externalId,
        occurredAt: r.insertTime,
        payload: { network: r.network, txId: r.txId },
      })),
    );
  }

  private async syncWithdrawals(now: number): Promise<number> {
    const since = await this.lastOccurred('WITHDRAWAL', now);
    const rows = await this.walletHistory
      .fetchWithdrawals(since, now)
      .catch(() => []);
    const events: Array<{
      type: CapitalEventType;
      amount: number;
      currency: string;
      externalId: string;
      occurredAt: Date;
      source: string;
      payload: Record<string, unknown>;
    }> = [];
    for (const r of rows) {
      events.push({
        type: 'WITHDRAWAL',
        amount: -Math.abs(r.amount),
        currency: r.coin,
        externalId: r.externalId,
        occurredAt: r.applyTime,
        source: SOURCE,
        payload: { network: r.network, txId: r.txId },
      });
      if (r.fee > 0) {
        events.push({
          type: 'FEE',
          amount: -Math.abs(r.fee),
          currency: r.coin,
          externalId: `${r.externalId}:fee`,
          occurredAt: r.applyTime,
          source: SOURCE,
          payload: { kind: 'withdrawal-fee', txId: r.txId },
        });
      }
    }
    return this.ledger.recordMany(events);
  }

  private async syncRebates(now: number): Promise<number> {
    const since = await this.lastOccurred('REBATE', now);
    const rows = await this.walletHistory
      .fetchDividends(since, now)
      .catch(() => []);
    return this.ledger.recordMany(
      rows.map((r) => ({
        type: 'REBATE' as CapitalEventType,
        amount: Math.abs(r.amount),
        currency: r.asset,
        source: SOURCE,
        externalId: r.externalId,
        occurredAt: r.divTime,
        payload: { enInfo: r.enInfo },
      })),
    );
  }

  /**
   * Funding fee de futuros perpetuos (USDⓈ-M) ya cobrado/pagado -- hueco de
   * roadmap distinto del interés de margin que ya cubre syncInterest().
   */
  private async syncFunding(now: number): Promise<number> {
    const since = await this.lastOccurred('FUNDING', now);
    const rows = await this.walletHistory
      .fetchFundingFees(since, now)
      .catch(() => []);
    return this.ledger.recordMany(
      rows.map((r) => ({
        type: 'FUNDING' as CapitalEventType,
        amount: r.income, // ya viene con signo (negativo = pagado)
        currency: r.asset,
        source: SOURCE,
        externalId: r.externalId,
        occurredAt: r.time,
        payload: { symbol: r.symbol },
      })),
    );
  }

  private async lastOccurred(type: string, now: number): Promise<number> {
    const last = await this.prisma.capitalEvent.findFirst({
      where: { type, source: SOURCE },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    });
    if (last?.occurredAt) {
      return Math.max(
        last.occurredAt.getTime() - 60_000,
        now - INITIAL_WINDOW_DAYS * 86_400_000,
      );
    }
    return now - INITIAL_WINDOW_DAYS * 86_400_000;
  }
}
