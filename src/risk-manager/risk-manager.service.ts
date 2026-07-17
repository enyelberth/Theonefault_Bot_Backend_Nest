import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BotRunStatus,
  Prisma,
  PrismaClient,
  RiskConfig,
  RiskEvent,
} from '@prisma/client';
import { BotService } from 'src/bot/bot.service';
import { DashboardService } from 'src/dashboard/dashboard.service';

const DEFAULT_CONFIG: Omit<RiskConfig, 'updatedAt' | 'createdAt'> = {
  id: 1,
  enabled: true,
  maxDailyLossQuote: null,
  maxDrawdownPct: null,
  maxOpenBots: null,
  maxLossPerBotQuote: null,
  minWinRatePct: null,
  minTradesForWinRateEval: 20,
  emergencyStopUntil: null,
};

@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaClient,
    @Inject(forwardRef(() => BotService)) private readonly botService: BotService,
    private readonly dashboard: DashboardService,
  ) {}

  async getConfig(): Promise<RiskConfig> {
    const existing = await this.prisma.riskConfig.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    return this.prisma.riskConfig.create({
      data: DEFAULT_CONFIG as any,
    });
  }

  async updateConfig(input: Partial<Omit<RiskConfig, 'id' | 'updatedAt' | 'createdAt'>>): Promise<RiskConfig> {
    await this.getConfig();
    return this.prisma.riskConfig.update({
      where: { id: 1 },
      data: {
        ...input,
        maxDailyLossQuote:
          input.maxDailyLossQuote !== undefined
            ? input.maxDailyLossQuote === null
              ? null
              : new Prisma.Decimal(input.maxDailyLossQuote as any)
            : undefined,
        maxLossPerBotQuote:
          input.maxLossPerBotQuote !== undefined
            ? input.maxLossPerBotQuote === null
              ? null
              : new Prisma.Decimal(input.maxLossPerBotQuote as any)
            : undefined,
      },
    });
  }

  async listEvents(limit = 100): Promise<RiskEvent[]> {
    return this.prisma.riskEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async emergencyStopAll(reason: string): Promise<{ stopped: number }> {
    const runs = await this.prisma.botRun.findMany({
      where: { status: BotRunStatus.RUNNING },
      select: { id: true, symbol: true, strategyId: true },
    });

    let stopped = 0;
    for (const r of runs) {
      try {
        await this.botService.stopStrategy(r.symbol, r.strategyId);
        stopped += 1;
      } catch (err) {
        this.logger.error(`emergencyStop: failed to stop ${r.symbol}/${r.strategyId}`, err as Error);
      }
    }

    await this.prisma.riskConfig.update({
      where: { id: 1 },
      data: { emergencyStopUntil: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await this.logEvent({
      type: 'EMERGENCY',
      message: reason,
      action: 'STOPPED_ALL',
      metadata: { stoppedCount: stopped },
    });

    this.logger.warn(`EMERGENCY STOP triggered: ${reason}. Stopped ${stopped} bots.`);
    return { stopped };
  }

  async clearEmergencyStop(): Promise<void> {
    await this.prisma.riskConfig.update({
      where: { id: 1 },
      data: { emergencyStopUntil: null },
    });
    await this.logEvent({
      type: 'EMERGENCY',
      message: 'Emergency stop cleared',
      action: 'IGNORED',
    });
  }

  /** True → bloquea nuevos bots por breaker activo */
  async isEmergencyActive(): Promise<boolean> {
    const cfg = await this.getConfig();
    if (!cfg.emergencyStopUntil) return false;
    return cfg.emergencyStopUntil.getTime() > Date.now();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async periodicCheck() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.checkAll();
    } catch (err) {
      this.logger.error('periodicCheck err', err as Error);
    } finally {
      this.busy = false;
    }
  }

  async checkAll(): Promise<void> {
    const cfg = await this.getConfig();
    if (!cfg.enabled) return;

    // Check global: maxDailyLoss
    if (cfg.maxDailyLossQuote) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const agg = await this.prisma.tradeResult.aggregate({
        where: { closedAt: { gte: since } },
        _sum: { pnl: true },
      });
      const dailyPnl = (agg._sum.pnl ?? new Prisma.Decimal(0)).toNumber();
      const limit = cfg.maxDailyLossQuote.toNumber();
      if (dailyPnl <= -Math.abs(limit)) {
        await this.emergencyStopAll(
          `Daily loss limit reached: ${dailyPnl} <= -${limit}`,
        );
        return;
      }
    }

    // Check maxOpenBots
    if (cfg.maxOpenBots) {
      const activeCount = await this.prisma.botRun.count({
        where: { status: BotRunStatus.RUNNING },
      });
      if (activeCount > cfg.maxOpenBots) {
        this.logger.warn(`Too many bots active: ${activeCount} > ${cfg.maxOpenBots}`);
      }
    }

    // Check per-bot: maxLossPerBot, maxDrawdown, minWinRate
    const runs = await this.prisma.botRun.findMany({
      where: { status: BotRunStatus.RUNNING },
    });

    for (const run of runs) {
      try {
        await this.evaluateBot(run.id, run.symbol, run.strategyId, cfg);
      } catch (err) {
        this.logger.error(`evaluateBot ${run.id} err`, err as Error);
      }
    }
  }

  private async evaluateBot(
    botRunId: number,
    symbol: string,
    strategyId: string,
    cfg: RiskConfig,
  ) {
    const summary = await this.dashboard.summarizeRun(
      (await this.prisma.botRun.findUnique({ where: { id: botRunId } }))!,
    );

    const realized = parseFloat(summary.realizedPnl);

    // Max loss per bot
    if (cfg.maxLossPerBotQuote) {
      const limit = cfg.maxLossPerBotQuote.toNumber();
      if (realized <= -Math.abs(limit)) {
        await this.stopWithEvent({
          botRunId,
          symbol,
          strategyId,
          type: 'MAX_LOSS',
          message: `Bot ${botRunId} loss ${realized} <= -${limit}`,
        });
        return;
      }
    }

    // Max drawdown
    if (cfg.maxDrawdownPct) {
      const dd = await this.dashboard.getDrawdown(botRunId);
      if (dd.maxDrawdownPct >= cfg.maxDrawdownPct) {
        await this.stopWithEvent({
          botRunId,
          symbol,
          strategyId,
          type: 'MAX_DRAWDOWN',
          message: `Bot ${botRunId} drawdown ${dd.maxDrawdownPct.toFixed(2)}% >= ${cfg.maxDrawdownPct}%`,
          metadata: { drawdown: dd.maxDrawdownPct, absolute: dd.maxDrawdown },
        });
        return;
      }
    }

    // Min win rate (solo si tiene suficientes trades)
    if (cfg.minWinRatePct && summary.tradesCount >= cfg.minTradesForWinRateEval) {
      if (summary.winRate < cfg.minWinRatePct) {
        await this.stopWithEvent({
          botRunId,
          symbol,
          strategyId,
          type: 'WIN_RATE',
          message: `Bot ${botRunId} winRate ${summary.winRate.toFixed(1)}% < ${cfg.minWinRatePct}% (${summary.tradesCount} trades)`,
          metadata: { winRate: summary.winRate, trades: summary.tradesCount },
        });
      }
    }
  }

  private async stopWithEvent(input: {
    botRunId: number;
    symbol: string;
    strategyId: string;
    type: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await this.botService.stopStrategy(input.symbol, input.strategyId);
      await this.logEvent({
        type: input.type,
        botRunId: input.botRunId,
        symbol: input.symbol,
        message: input.message,
        action: 'STOPPED_BOT',
        metadata: input.metadata,
      });
      this.logger.warn(`RISK: ${input.message}`);
    } catch (err) {
      this.logger.error(`stopWithEvent err`, err as Error);
    }
  }

  private async logEvent(input: {
    type: string;
    botRunId?: number;
    symbol?: string;
    message: string;
    action: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.prisma.riskEvent.create({ data: input });
  }
}
