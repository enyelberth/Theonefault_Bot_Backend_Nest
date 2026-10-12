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
import {
  BotRunnerService,
  BotRunnerStatus,
} from 'src/bot-runner/bot-runner.service';

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
  guardBufferPct: 4,
  guardConfirmTicks: 3,
  guardCooldownMinutes: 15,
  consecutiveLossLimit: null,
  includeUnrealizedInDailyLoss: true,
  maxCrossBotExposurePct: null,
};

@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaClient,
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
    private readonly dashboard: DashboardService,
    private readonly botRunner: BotRunnerService,
  ) {}

  async getConfig(): Promise<RiskConfig> {
    const existing = await this.prisma.riskConfig.findUnique({
      where: { id: 1 },
    });
    if (existing) return existing;
    return this.prisma.riskConfig.create({
      data: DEFAULT_CONFIG as any,
    });
  }

  async updateConfig(
    input: Partial<Omit<RiskConfig, 'id' | 'updatedAt' | 'createdAt'>>,
  ): Promise<RiskConfig> {
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
        this.logger.error(
          `emergencyStop: failed to stop ${r.symbol}/${r.strategyId}`,
          err as Error,
        );
      }
    }

    // El watchdog original solo paraba bots legacy (BotService) -- los
    // runners v2 (BotRunnerService) corrían sin frenarse ante un stop de
    // emergencia global. Se agregan acá para que el breaker cubra ambos
    // motores.
    for (const status of this.botRunner.list()) {
      try {
        await this.botRunner.stop(status.runId);
        stopped += 1;
      } catch (err) {
        this.logger.error(
          `emergencyStop: failed to stop v2 runner ${status.runId}`,
          err as Error,
        );
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

    this.logger.warn(
      `EMERGENCY STOP triggered: ${reason}. Stopped ${stopped} bots.`,
    );
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

    // Check global: maxDailyLoss (realized + optional unrealized)
    if (cfg.maxDailyLossQuote) {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const agg = await this.prisma.tradeResult.aggregate({
        where: { closedAt: { gte: since } },
        _sum: { pnl: true },
      });
      let dailyPnl = (agg._sum.pnl ?? new Prisma.Decimal(0)).toNumber();
      let unrealizedTotal = 0;

      if (cfg.includeUnrealizedInDailyLoss) {
        const activeRuns = await this.prisma.botRun.findMany({
          where: { status: BotRunStatus.RUNNING },
          select: { id: true },
        });
        for (const r of activeRuns) {
          const last = await this.prisma.botMetric.findFirst({
            where: { botRunId: r.id },
            orderBy: { ts: 'desc' },
            select: { unrealizedPnl: true },
          });
          if (last?.unrealizedPnl) {
            unrealizedTotal += new Prisma.Decimal(
              last.unrealizedPnl,
            ).toNumber();
          }
        }
        dailyPnl += unrealizedTotal;
      }

      // Agrega también el PnL diario realizado de los runners v2. El
      // unrealized de v2 no se suma acá: BotRunnerStatus no expone el valor
      // de las posiciones abiertas por separado del equity total, y
      // reconstruirlo sin esa pieza daría un número falso. Queda pendiente
      // como parte del ítem de roadmap "riesgo agregado de cartera".
      for (const status of this.botRunner.list()) {
        dailyPnl += status.dailyPnl ?? 0;
      }

      const limit = cfg.maxDailyLossQuote.toNumber();
      if (dailyPnl <= -Math.abs(limit)) {
        await this.emergencyStopAll(
          `Daily loss (realized+unrealized=${dailyPnl.toFixed(2)}) <= -${limit}`,
        );
        return;
      }
    }

    // Cross-bot aggregated exposure
    if (cfg.maxCrossBotExposurePct) {
      const active = await this.prisma.botRun.findMany({
        where: { status: BotRunStatus.RUNNING },
        select: { id: true, initialQuote: true },
      });
      let equityBase = 0;
      let openExposure = 0;
      for (const r of active) {
        const last = await this.prisma.botMetric.findFirst({
          where: { botRunId: r.id },
          orderBy: { ts: 'desc' },
          select: { openPositions: true, lastPrice: true },
        });
        if (r.initialQuote)
          equityBase += new Prisma.Decimal(r.initialQuote).toNumber();
        if (last?.openPositions && last.lastPrice) {
          openExposure +=
            last.openPositions * new Prisma.Decimal(last.lastPrice).toNumber();
        }
      }
      if (equityBase > 0) {
        const pct = (openExposure / equityBase) * 100;
        if (pct >= cfg.maxCrossBotExposurePct) {
          await this.emergencyStopAll(
            `Cross-bot exposure ${pct.toFixed(2)}% >= ${cfg.maxCrossBotExposurePct}%`,
          );
          return;
        }
      }
    }

    // Check maxOpenBots (cuenta legacy + v2, son el mismo límite de cartera)
    if (cfg.maxOpenBots) {
      const legacyCount = await this.prisma.botRun.count({
        where: { status: BotRunStatus.RUNNING },
      });
      const activeCount = legacyCount + this.botRunner.list().length;
      if (activeCount > cfg.maxOpenBots) {
        this.logger.warn(
          `Too many bots active: ${activeCount} > ${cfg.maxOpenBots}`,
        );
      }
    }

    // Check per-bot: maxLossPerBot, maxDrawdown, minWinRate, consecutiveLoss
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

    for (const status of this.botRunner.list()) {
      try {
        await this.evaluateBotV2(status, cfg);
      } catch (err) {
        this.logger.error(`evaluateBotV2 ${status.runId} err`, err as Error);
      }
    }
  }

  private async countConsecutiveLosses(
    botRunId: number,
    lookback = 50,
  ): Promise<number> {
    const trades = await this.prisma.tradeResult.findMany({
      where: { botRunId },
      orderBy: { closedAt: 'desc' },
      take: lookback,
      select: { pnl: true },
    });
    let streak = 0;
    for (const t of trades) {
      if (new Prisma.Decimal(t.pnl).lte(0)) streak += 1;
      else break;
    }
    return streak;
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
    if (
      cfg.minWinRatePct &&
      summary.tradesCount >= cfg.minTradesForWinRateEval
    ) {
      if (summary.winRate < cfg.minWinRatePct) {
        await this.stopWithEvent({
          botRunId,
          symbol,
          strategyId,
          type: 'WIN_RATE',
          message: `Bot ${botRunId} winRate ${summary.winRate.toFixed(1)}% < ${cfg.minWinRatePct}% (${summary.tradesCount} trades)`,
          metadata: { winRate: summary.winRate, trades: summary.tradesCount },
        });
        return;
      }
    }

    // Consecutive-loss circuit breaker
    if (cfg.consecutiveLossLimit && cfg.consecutiveLossLimit > 0) {
      const streak = await this.countConsecutiveLosses(botRunId);
      if (streak >= cfg.consecutiveLossLimit) {
        await this.stopWithEvent({
          botRunId,
          symbol,
          strategyId,
          type: 'CONSECUTIVE_LOSS',
          message: `Bot ${botRunId} consecutive losses ${streak} >= ${cfg.consecutiveLossLimit}`,
          metadata: { streak, limit: cfg.consecutiveLossLimit },
        });
      }
    }
  }

  private async countConsecutiveLossesV2(
    botRunnerRunId: number,
    lookback = 50,
  ): Promise<number> {
    const trades = await this.prisma.botRunnerTrade.findMany({
      where: { botRunnerRunId, closedAt: { not: null } },
      orderBy: { closedAt: 'desc' },
      take: lookback,
      select: { pnl: true },
    });
    let streak = 0;
    for (const t of trades) {
      if (new Prisma.Decimal(t.pnl ?? 0).lte(0)) streak += 1;
      else break;
    }
    return streak;
  }

  /** Equivalente a evaluateBot() pero para runners del motor v2 (BotRunnerService). */
  private async evaluateBotV2(status: BotRunnerStatus, cfg: RiskConfig) {
    const botRunnerRunId = status.dbId;
    if (botRunnerRunId === undefined) return;

    // Max loss per bot (PnL realizado acumulado del runner)
    if (cfg.maxLossPerBotQuote) {
      const limit = cfg.maxLossPerBotQuote.toNumber();
      const realized = status.realizedPnl ?? 0;
      if (realized <= -Math.abs(limit)) {
        await this.stopV2WithEvent({
          status,
          type: 'MAX_LOSS',
          message: `Runner v2 ${status.runId} loss ${realized} <= -${limit}`,
        });
        return;
      }
    }

    // Max drawdown
    if (cfg.maxDrawdownPct && (status.drawdownPct ?? 0) >= cfg.maxDrawdownPct) {
      await this.stopV2WithEvent({
        status,
        type: 'MAX_DRAWDOWN',
        message: `Runner v2 ${status.runId} drawdown ${(status.drawdownPct ?? 0).toFixed(2)}% >= ${cfg.maxDrawdownPct}%`,
        metadata: { drawdown: status.drawdownPct },
      });
      return;
    }

    // Min win rate (solo si tiene suficientes trades cerrados)
    if (cfg.minWinRatePct) {
      const [total, winners] = await Promise.all([
        this.prisma.botRunnerTrade.count({
          where: { botRunnerRunId, closedAt: { not: null } },
        }),
        this.prisma.botRunnerTrade.count({
          where: {
            botRunnerRunId,
            closedAt: { not: null },
            pnl: { gt: 0 },
          },
        }),
      ]);
      if (total >= cfg.minTradesForWinRateEval) {
        const winRate = (winners / total) * 100;
        if (winRate < cfg.minWinRatePct) {
          await this.stopV2WithEvent({
            status,
            type: 'WIN_RATE',
            message: `Runner v2 ${status.runId} winRate ${winRate.toFixed(1)}% < ${cfg.minWinRatePct}% (${total} trades)`,
            metadata: { winRate, trades: total },
          });
          return;
        }
      }
    }

    // Consecutive-loss circuit breaker
    if (cfg.consecutiveLossLimit && cfg.consecutiveLossLimit > 0) {
      const streak = await this.countConsecutiveLossesV2(botRunnerRunId);
      if (streak >= cfg.consecutiveLossLimit) {
        await this.stopV2WithEvent({
          status,
          type: 'CONSECUTIVE_LOSS',
          message: `Runner v2 ${status.runId} consecutive losses ${streak} >= ${cfg.consecutiveLossLimit}`,
          metadata: { streak, limit: cfg.consecutiveLossLimit },
        });
      }
    }
  }

  private async stopV2WithEvent(input: {
    status: BotRunnerStatus;
    type: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await this.botRunner.stop(input.status.runId);
      await this.logEvent({
        type: input.type,
        botRunId: input.status.dbId,
        symbol: input.status.symbol,
        message: input.message,
        action: 'STOPPED_BOT',
        metadata: { ...(input.metadata as object), engine: 'v2', runId: input.status.runId },
      });
      this.logger.warn(`RISK (v2): ${input.message}`);
    } catch (err) {
      this.logger.error(`stopV2WithEvent err`, err as Error);
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
