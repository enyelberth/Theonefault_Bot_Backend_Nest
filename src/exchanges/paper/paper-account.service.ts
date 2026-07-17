import { Injectable, NotFoundException } from '@nestjs/common';
import { PaperAccount, Prisma, PrismaClient } from '@prisma/client';
import { PaperBalances, ensureBalance } from './paper-types';
import { DEFAULT_FEES, FeesConfig } from '../../backtesting/engine/fees';

export interface CreatePaperAccountInput {
  name: string;
  ownerId?: number;
  initialQuote: number;
  quoteAsset?: string;
  fees?: FeesConfig;
}

export interface UpdatePaperAccountInput {
  name?: string;
  active?: boolean;
  fees?: FeesConfig;
}

@Injectable()
export class PaperAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreatePaperAccountInput): Promise<PaperAccount> {
    const quoteAsset = input.quoteAsset ?? 'USDT';
    const balances: PaperBalances = {
      [quoteAsset]: { free: input.initialQuote, locked: 0 },
    };
    return this.prisma.paperAccount.create({
      data: {
        name: input.name,
        ownerId: input.ownerId,
        quoteAsset,
        initialQuote: new Prisma.Decimal(input.initialQuote),
        balances: balances as unknown as Prisma.InputJsonValue,
        feesConfig: (input.fees ?? DEFAULT_FEES) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async get(id: number): Promise<PaperAccount> {
    const account = await this.prisma.paperAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`PaperAccount ${id} not found`);
    return account;
  }

  async list(ownerId?: number): Promise<PaperAccount[]> {
    return this.prisma.paperAccount.findMany({
      where: ownerId ? { ownerId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: number, input: UpdatePaperAccountInput): Promise<PaperAccount> {
    return this.prisma.paperAccount.update({
      where: { id },
      data: {
        name: input.name,
        active: input.active,
        feesConfig: input.fees ? (input.fees as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async reset(id: number): Promise<PaperAccount> {
    const account = await this.get(id);
    const balances: PaperBalances = {
      [account.quoteAsset]: { free: Number(account.initialQuote), locked: 0 },
    };
    await this.prisma.paperFill.deleteMany({ where: { paperAccountId: id } });
    return this.prisma.paperAccount.update({
      where: { id },
      data: { balances: balances as unknown as Prisma.InputJsonValue },
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.paperAccount.delete({ where: { id } });
  }

  readBalances(account: PaperAccount): PaperBalances {
    const raw = (account.balances ?? {}) as Record<string, unknown>;
    const out: PaperBalances = {};
    for (const [asset, entry] of Object.entries(raw)) {
      const e = entry as Record<string, unknown>;
      out[asset] = {
        free: Number(e.free ?? 0),
        locked: Number(e.locked ?? 0),
        avgEntry: e.avgEntry !== undefined ? Number(e.avgEntry) : undefined,
      };
    }
    return out;
  }

  readFees(account: PaperAccount): FeesConfig {
    return { ...DEFAULT_FEES, ...((account.feesConfig ?? {}) as Partial<FeesConfig>) };
  }

  async persistBalances(id: number, balances: PaperBalances): Promise<void> {
    await this.prisma.paperAccount.update({
      where: { id },
      data: { balances: balances as unknown as Prisma.InputJsonValue },
    });
  }

  async recordFill(input: {
    paperAccountId: number;
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    price: number;
    quantity: number;
    fee: number;
    feeAsset: string;
    reason?: string;
  }): Promise<void> {
    await this.prisma.paperFill.create({
      data: {
        paperAccountId: input.paperAccountId,
        orderId: input.orderId,
        symbol: input.symbol,
        side: input.side,
        type: input.type,
        price: new Prisma.Decimal(input.price),
        quantity: new Prisma.Decimal(input.quantity),
        quoteQuantity: new Prisma.Decimal(input.price * input.quantity),
        fee: new Prisma.Decimal(input.fee),
        feeAsset: input.feeAsset,
        reason: input.reason,
      },
    });
  }

  async listFills(paperAccountId: number, limit = 100) {
    return this.prisma.paperFill.findMany({
      where: { paperAccountId },
      orderBy: { filledAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  ensureBalance = ensureBalance;
}
