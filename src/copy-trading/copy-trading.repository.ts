import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CopyEvent,
  CopyExecution,
  CopyMaster,
  CopySubscription,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { CreateMasterDto } from './dto/create-master.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class CopyTradingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createMaster(dto: CreateMasterDto): Promise<CopyMaster> {
    return this.prisma.copyMaster.create({
      data: {
        runId: dto.runId,
        name: dto.name,
        description: dto.description,
        ownerId: dto.ownerId,
        visibility: dto.visibility,
        active: dto.active ?? true,
      },
    });
  }

  findMasterByRunId(runId: string): Promise<CopyMaster | null> {
    return this.prisma.copyMaster.findUnique({ where: { runId } });
  }

  findMasterById(id: number): Promise<CopyMaster | null> {
    return this.prisma.copyMaster.findUnique({ where: { id } });
  }

  findSubscriptionById(id: number): Promise<CopySubscription | null> {
    return this.prisma.copySubscription.findUnique({ where: { id } });
  }

  listMasters(): Promise<CopyMaster[]> {
    return this.prisma.copyMaster.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async setMasterActive(id: number, active: boolean): Promise<CopyMaster> {
    try {
      return await this.prisma.copyMaster.update({ where: { id }, data: { active } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`CopyMaster ${id} not found`);
      }
      throw e;
    }
  }

  createSubscription(dto: CreateSubscriptionDto): Promise<CopySubscription> {
    return this.prisma.copySubscription.create({
      data: {
        masterId: dto.masterId,
        followerRunId: dto.followerRunId,
        ownerId: dto.ownerId,
        exchangeMode: dto.exchangeMode,
        exchangeId: dto.exchangeId,
        paperAccountId: dto.paperAccountId,
        mode: dto.mode,
        sizeMultiplier: dto.sizeMultiplier ?? 1,
        fixedQuote: dto.fixedQuote,
        maxRiskPct: dto.maxRiskPct,
        active: dto.active ?? true,
      },
    });
  }

  listSubscriptionsByMaster(masterId: number, activeOnly = true): Promise<CopySubscription[]> {
    return this.prisma.copySubscription.findMany({
      where: { masterId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteSubscription(id: number): Promise<void> {
    try {
      await this.prisma.copySubscription.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`CopySubscription ${id} not found`);
      }
      throw e;
    }
  }

  recordEvent(masterId: number, signal: unknown, fanoutCount: number): Promise<CopyEvent> {
    return this.prisma.copyEvent.create({
      data: {
        masterId,
        signal: signal as Prisma.InputJsonValue,
        fanoutCount,
      },
    });
  }

  incrementFollowerCount(masterId: number, delta: number): Promise<CopyMaster> {
    return this.prisma.copyMaster.update({
      where: { id: masterId },
      data: { followerCount: { increment: delta } },
    });
  }

  recordExecution(input: {
    copyEventId: number;
    subscriptionId: number;
    status: string;
    reason?: string;
    orderId?: string;
    price?: number;
    quantity?: number;
    quoteQuantity?: number;
  }): Promise<CopyExecution> {
    return this.prisma.copyExecution.create({
      data: {
        copyEventId: input.copyEventId,
        subscriptionId: input.subscriptionId,
        status: input.status,
        reason: input.reason,
        orderId: input.orderId,
        price: input.price !== undefined ? new Prisma.Decimal(input.price) : undefined,
        quantity: input.quantity !== undefined ? new Prisma.Decimal(input.quantity) : undefined,
        quoteQuantity:
          input.quoteQuantity !== undefined ? new Prisma.Decimal(input.quoteQuantity) : undefined,
      },
    });
  }
}
