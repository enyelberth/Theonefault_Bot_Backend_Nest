import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CopyEvent,
  CopyMaster,
  CopySubscription,
} from '@prisma/client';
import { CopySignalBus, CopySignalEvent } from './copy-signal.bus';
import { CopyExecutorService } from './copy-executor.service';
import { CopyTradingRepository } from './copy-trading.repository';
import { CreateMasterDto } from './dto/create-master.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class CopyTradingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CopyTradingService.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly repo: CopyTradingRepository,
    private readonly bus: CopySignalBus,
    private readonly executor: CopyExecutorService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.bus.subscribe(async (event) => {
      await this.persist(event);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async registerMaster(dto: CreateMasterDto): Promise<CopyMaster> {
    const existing = await this.repo.findMasterByRunId(dto.runId);
    if (existing) return existing;
    return this.repo.createMaster(dto);
  }

  listMasters(): Promise<CopyMaster[]> {
    return this.repo.listMasters();
  }

  async setActive(id: number, active: boolean): Promise<CopyMaster> {
    return this.repo.setMasterActive(id, active);
  }

  async subscribe(dto: CreateSubscriptionDto): Promise<CopySubscription> {
    const master = await this.repo.findMasterById(dto.masterId);
    if (!master) throw new NotFoundException(`CopyMaster ${dto.masterId} not found`);
    const sub = await this.repo.createSubscription(dto);
    await this.repo.incrementFollowerCount(dto.masterId, 1);
    return sub;
  }

  async unsubscribeById(id: number): Promise<void> {
    const sub = await this.repo.findSubscriptionById(id);
    if (!sub) throw new NotFoundException(`CopySubscription ${id} not found`);
    await this.repo.deleteSubscription(id);
    await this.repo.incrementFollowerCount(sub.masterId, -1).catch(() => undefined);
  }

  listSubscriptions(masterId: number): Promise<CopySubscription[]> {
    return this.repo.listSubscriptionsByMaster(masterId, false);
  }

  private async persist(event: CopySignalEvent): Promise<CopyEvent | null> {
    try {
      const master = await this.repo.findMasterByRunId(event.masterRunId);
      if (!master || !master.active) return null;
      const followers = await this.repo.listSubscriptionsByMaster(master.id, true);
      const recorded = await this.repo.recordEvent(master.id, event.signal, followers.length);
      if (followers.length > 0) {
        await Promise.all(
          followers.map((sub) =>
            this.executor.dispatch({
              copyEventId: recorded.id,
              masterRunId: event.masterRunId,
              masterEquity: event.masterEquity,
              signal: event.signal,
              subscription: sub,
            }),
          ),
        );
      }
      return recorded;
    } catch (e) {
      this.logger.warn(`persist CopyEvent failed: ${(e as Error).message}`);
      return null;
    }
  }
}
