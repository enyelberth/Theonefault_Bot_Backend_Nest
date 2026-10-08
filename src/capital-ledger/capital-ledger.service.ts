import { Injectable, Logger } from '@nestjs/common';
import { CapitalEvent, Prisma, PrismaClient } from '@prisma/client';

export type CapitalEventType =
  | 'TRADE_PNL'
  | 'FEE'
  | 'FUNDING'
  | 'INTEREST'
  | 'REBATE'
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'ADJUSTMENT';

export interface RecordCapitalEventInput {
  type: CapitalEventType;
  amount: number;
  currency?: string;
  botRunnerRunId?: number;
  tradeId?: number;
  correlationId?: string;
  source?: string;
  externalId?: string;
  occurredAt?: Date;
  payload?: Record<string, unknown>;
}

export interface LedgerFilters {
  botRunnerRunId?: number;
  type?: CapitalEventType;
  from?: Date;
  to?: Date;
  currency?: string;
}

export interface TypeTotal {
  type: CapitalEventType;
  currency: string;
  total: number;
  count: number;
}

export interface DailyTotal {
  day: string;
  currency: string;
  total: number;
  gains: number;
  losses: number;
  count: number;
}

@Injectable()
export class CapitalLedgerService {
  private readonly logger = new Logger(CapitalLedgerService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordCapitalEventInput): Promise<CapitalEvent | null> {
    if (!Number.isFinite(input.amount) || input.amount === 0) return null;
    const payload = input.payload
      ? (JSON.parse(JSON.stringify(input.payload)) as Prisma.InputJsonValue)
      : undefined;
    const data = {
      type: input.type,
      amount: new Prisma.Decimal(input.amount),
      currency: input.currency ?? 'USDT',
      botRunnerRunId: input.botRunnerRunId,
      tradeId: input.tradeId,
      correlationId: input.correlationId,
      source: input.source,
      externalId: input.externalId,
      occurredAt: input.occurredAt,
      payload,
    };
    if (input.externalId && input.source) {
      return this.prisma.capitalEvent.upsert({
        where: {
          CapitalEvent_source_externalId_key: {
            source: input.source,
            externalId: input.externalId,
          },
        },
        update: {
          amount: data.amount,
          currency: data.currency,
          payload: data.payload,
          occurredAt: data.occurredAt ?? undefined,
        },
        create: data,
      });
    }
    return this.prisma.capitalEvent.create({ data });
  }

  async recordMany(inputs: RecordCapitalEventInput[]): Promise<number> {
    let inserted = 0;
    for (const i of inputs) {
      const res = await this.record(i).catch((e) => {
        this.logger.warn(`recordMany: ${e.message}`);
        return null;
      });
      if (res) inserted += 1;
    }
    return inserted;
  }

  async summaryByType(filters: LedgerFilters = {}): Promise<TypeTotal[]> {
    const rows = await this.prisma.capitalEvent.groupBy({
      by: ['type', 'currency'],
      where: this.whereClause(filters),
      _sum: { amount: true },
      _count: { _all: true },
    });
    return rows
      .map((r) => ({
        type: r.type as CapitalEventType,
        currency: r.currency,
        total: Number(r._sum.amount ?? 0),
        count: r._count._all,
      }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }

  async dailyTotals(filters: LedgerFilters = {}): Promise<DailyTotal[]> {
    const events = await this.prisma.capitalEvent.findMany({
      where: this.whereClause(filters),
      select: { amount: true, currency: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    });
    const map = new Map<
      string,
      {
        day: string;
        currency: string;
        total: Prisma.Decimal;
        gains: Prisma.Decimal;
        losses: Prisma.Decimal;
        count: number;
      }
    >();
    for (const e of events) {
      const day = e.occurredAt.toISOString().slice(0, 10);
      const key = `${day}|${e.currency}`;
      const amt = new Prisma.Decimal(e.amount);
      const bucket = map.get(key) ?? {
        day,
        currency: e.currency,
        total: new Prisma.Decimal(0),
        gains: new Prisma.Decimal(0),
        losses: new Prisma.Decimal(0),
        count: 0,
      };
      bucket.total = bucket.total.plus(amt);
      if (amt.isPositive()) bucket.gains = bucket.gains.plus(amt);
      else bucket.losses = bucket.losses.plus(amt);
      bucket.count += 1;
      map.set(key, bucket);
    }
    return Array.from(map.values())
      .map((b) => ({
        day: b.day,
        currency: b.currency,
        total: Number(b.total.toFixed(8)),
        gains: Number(b.gains.toFixed(8)),
        losses: Number(b.losses.toFixed(8)),
        count: b.count,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }

  async roi(filters: LedgerFilters = {}): Promise<{
    generatedAt: string;
    currency: string;
    breakdown: { type: CapitalEventType; total: number }[];
    netCapitalInjected: number;
    grossTradePnl: number;
    fees: number;
    interest: number;
    rebates: number;
    netReturn: number;
    roiPct: number | null;
  }> {
    const currency = filters.currency ?? 'USDT';
    const grouped = await this.summaryByType({ ...filters, currency });
    const byType = new Map<CapitalEventType, number>();
    for (const g of grouped) byType.set(g.type, g.total);
    const grossTradePnl = byType.get('TRADE_PNL') ?? 0;
    const fees = byType.get('FEE') ?? 0;
    const interest = byType.get('INTEREST') ?? 0;
    const rebates = byType.get('REBATE') ?? 0;
    const funding = byType.get('FUNDING') ?? 0;
    const adjustment = byType.get('ADJUSTMENT') ?? 0;
    const deposits = byType.get('DEPOSIT') ?? 0;
    const withdrawals = byType.get('WITHDRAWAL') ?? 0;
    const netCapital = deposits + withdrawals;
    const netReturn =
      grossTradePnl + fees + interest + rebates + funding + adjustment;
    const roiPct = netCapital > 0 ? (netReturn / netCapital) * 100 : null;
    return {
      generatedAt: new Date().toISOString(),
      currency,
      breakdown: grouped
        .filter((g) => g.currency === currency)
        .map((g) => ({ type: g.type, total: Number(g.total.toFixed(8)) })),
      netCapitalInjected: Number(netCapital.toFixed(8)),
      grossTradePnl: Number(grossTradePnl.toFixed(8)),
      fees: Number(fees.toFixed(8)),
      interest: Number(interest.toFixed(8)),
      rebates: Number(rebates.toFixed(8)),
      netReturn: Number(netReturn.toFixed(8)),
      roiPct: roiPct === null ? null : Number(roiPct.toFixed(4)),
    };
  }

  async list(
    filters: LedgerFilters & { limit?: number; offset?: number } = {},
  ) {
    const limit = Math.min(filters.limit ?? 100, 500);
    const offset = filters.offset ?? 0;
    const [total, rows] = await Promise.all([
      this.prisma.capitalEvent.count({ where: this.whereClause(filters) }),
      this.prisma.capitalEvent.findMany({
        where: this.whereClause(filters),
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
      }),
    ]);
    return { total, limit, offset, data: rows };
  }

  private whereClause(filters: LedgerFilters) {
    const where: Prisma.CapitalEventWhereInput = {};
    if (filters.botRunnerRunId !== undefined) {
      where.botRunnerRunId = filters.botRunnerRunId;
    }
    if (filters.type) where.type = filters.type;
    if (filters.currency) where.currency = filters.currency;
    if (filters.from || filters.to) {
      where.occurredAt = { gte: filters.from, lte: filters.to };
    }
    return where;
  }
}
