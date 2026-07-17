import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient, RunnerStatus } from '@prisma/client';
import type { Timeframe } from '../exchanges/domain';
import { BotRunnerService } from './bot-runner.service';

@Injectable()
export class BotRunnerReconciler implements OnModuleInit {
  private readonly logger = new Logger(BotRunnerReconciler.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly runner: BotRunnerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const orphans = await this.prisma.botRunnerRun.findMany({
      where: { status: RunnerStatus.RUNNING },
      orderBy: { startedAt: 'asc' },
    });
    if (orphans.length === 0) {
      this.logger.log('reconciler: no orphan runs');
      return;
    }
    this.logger.log(`reconciler: attempting to resurrect ${orphans.length} run(s)`);
    for (const run of orphans) {
      try {
        await this.runner.start({
          runId: run.runId,
          strategyId: run.strategyId,
          symbol: run.symbol,
          timeframe: run.timeframe as Timeframe,
          config: (run.config ?? {}) as Record<string, unknown>,
          exchange: {
            mode: run.exchangeMode as 'real' | 'paper',
            exchangeId: (run.exchangeId ?? undefined) as any,
            paperAccountId: run.paperAccountId ?? undefined,
          },
          riskProfileId: run.riskProfileId ?? undefined,
          ownerId: run.ownerId ?? undefined,
        });
        this.logger.log(`resurrected runner ${run.runId}`);
      } catch (err: any) {
        this.logger.error(`resurrect ${run.runId} failed: ${err.message}`);
        await this.prisma.botRunnerRun
          .update({
            where: { id: run.id },
            data: {
              status: RunnerStatus.ERROR,
              lastError: `reconciler: ${err.message}`,
              stoppedAt: new Date(),
            } as Prisma.BotRunnerRunUpdateInput,
          })
          .catch(() => undefined);
      }
    }
  }
}
