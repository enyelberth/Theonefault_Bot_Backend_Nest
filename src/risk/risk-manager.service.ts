import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient, RiskProfile } from '@prisma/client';
import type { Candle, RiskContext, RiskDecision, Signal } from '../exchanges/domain';
import { buildSizer, SizerSpec } from './sizing';
import type { SizingResult } from './sizing/position-sizer.interface';
import type { TrailingStopConfig } from './stops/trailing-stop';
import type { TpLadderConfig } from './stops/tp-ladder';

export interface RiskCheckInput {
  signal: Signal;
  context: RiskContext;
  history?: ReadonlyArray<Candle>;
  profile?: RiskProfile | null;
}

export interface RiskCheckResult {
  decision: RiskDecision;
  adjustedSignal?: Signal;
  sizing?: SizingResult;
}

@Injectable()
export class RiskManagerService {
  private readonly logger = new Logger(RiskManagerService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async check(input: RiskCheckInput): Promise<RiskCheckResult> {
    const { signal, context, profile } = input;

    if (context.killSwitchEnabled) {
      return {
        decision: { allowed: false, reason: 'kill switch active', code: 'KILL_SWITCH' },
      };
    }
    if (context.currentDrawdownPct >= context.maxDrawdownPct) {
      return {
        decision: {
          allowed: false,
          reason: `drawdown ${context.currentDrawdownPct.toFixed(2)}% >= max ${context.maxDrawdownPct}%`,
          code: 'MAX_DRAWDOWN',
        },
      };
    }
    if (context.dailyPnl < 0) {
      const dailyLossPct = (Math.abs(context.dailyPnl) / context.accountEquity) * 100;
      if (dailyLossPct >= context.maxDailyLossPct) {
        return {
          decision: {
            allowed: false,
            reason: `daily loss ${dailyLossPct.toFixed(2)}% >= max ${context.maxDailyLossPct}%`,
            code: 'MAX_DAILY_LOSS',
          },
        };
      }
    }

    if (
      (signal.action === 'OPEN' || signal.action === 'ADJUST') &&
      context.openPositionsCount >= context.maxOpenPositions
    ) {
      return {
        decision: {
          allowed: false,
          reason: `open positions ${context.openPositionsCount} >= max ${context.maxOpenPositions}`,
          code: 'MAX_POSITIONS',
        },
      };
    }

    let adjustedSignal = signal;
    let sizing: SizingResult | undefined;

    if ((signal.action === 'OPEN' || signal.action === 'ADJUST') && profile?.sizer) {
      const spec = profile.sizer as unknown as SizerSpec;
      try {
        const sizer = buildSizer(spec);
        sizing = sizer.compute({
          equity: context.accountEquity,
          price: signal.price ?? 0,
          stopPrice: signal.stopLossPrice,
          history: input.history,
          requestedQuote: signal.quoteQuantity,
          requestedQuantity: signal.quantity,
        });
        if (sizing.quoteQuantity <= 0) {
          return {
            decision: {
              allowed: false,
              reason: `sizer produced zero: ${sizing.notes ?? 'unknown'}`,
              code: 'INVALID_SIGNAL',
            },
            sizing,
          };
        }
        adjustedSignal = {
          ...signal,
          quoteQuantity: sizing.quoteQuantity,
          quantity: sizing.quantity,
          metadata: { ...(signal.metadata ?? {}), sizer: sizing.sizer, sizerNotes: sizing.notes },
        };
      } catch (e: any) {
        this.logger.warn(`sizer failed: ${e.message}`);
      }
    }

    const requestedQuote = adjustedSignal.quoteQuantity ?? 0;
    if (requestedQuote > 0) {
      const maxQuote = context.accountEquity * (context.maxPositionSizePct / 100);
      if (requestedQuote > maxQuote) {
        adjustedSignal = { ...adjustedSignal, quoteQuantity: maxQuote };
      }
      if (maxQuote <= 0) {
        return {
          decision: { allowed: false, reason: 'maxPositionSize=0', code: 'MAX_POSITION_SIZE' },
        };
      }
    }

    if ((adjustedSignal.quoteQuantity ?? 0) > context.freeMargin) {
      return {
        decision: {
          allowed: false,
          reason: `insufficient margin: need ${(adjustedSignal.quoteQuantity ?? 0).toFixed(2)}, free ${context.freeMargin.toFixed(2)}`,
          code: 'INSUFFICIENT_MARGIN',
        },
      };
    }

    return { decision: { allowed: true }, adjustedSignal, sizing };
  }

  async loadProfile(id: number): Promise<RiskProfile> {
    const profile = await this.prisma.riskProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException(`RiskProfile ${id} not found`);
    return profile;
  }

  async listProfiles(ownerId?: number): Promise<RiskProfile[]> {
    return this.prisma.riskProfile.findMany({
      where: ownerId ? { ownerId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createProfile(input: {
    name: string;
    ownerId?: number;
    maxDrawdownPct?: number;
    maxDailyLossPct?: number;
    maxPositionSizePct?: number;
    maxOpenPositions?: number;
    sizer?: SizerSpec;
    trailingStop?: TrailingStopConfig;
    tpLadder?: TpLadderConfig;
  }): Promise<RiskProfile> {
    return this.prisma.riskProfile.create({
      data: {
        name: input.name,
        ownerId: input.ownerId,
        maxDrawdownPct: input.maxDrawdownPct ?? 20,
        maxDailyLossPct: input.maxDailyLossPct ?? 5,
        maxPositionSizePct: input.maxPositionSizePct ?? 10,
        maxOpenPositions: input.maxOpenPositions ?? 5,
        sizer: input.sizer ? (input.sizer as unknown as Prisma.InputJsonValue) : undefined,
        trailingStop: input.trailingStop
          ? (input.trailingStop as unknown as Prisma.InputJsonValue)
          : undefined,
        tpLadder: input.tpLadder ? (input.tpLadder as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async updateProfile(id: number, data: Partial<RiskProfile>): Promise<RiskProfile> {
    return this.prisma.riskProfile.update({
      where: { id },
      data: data as Prisma.RiskProfileUpdateInput,
    });
  }

  async deleteProfile(id: number): Promise<void> {
    await this.prisma.riskProfile.delete({ where: { id } });
  }

  async killSwitchStatus(scope: string, targetId?: string) {
    return this.prisma.killSwitch.findFirst({
      where: { scope, targetId: targetId ?? null },
    });
  }

  async setKillSwitch(scope: string, targetId: string | null, enabled: boolean, reason?: string, triggeredBy?: string) {
    return this.prisma.killSwitch.upsert({
      where: { scope_targetId: { scope, targetId: targetId ?? '' } },
      create: {
        scope,
        targetId,
        enabled,
        reason,
        triggeredAt: enabled ? new Date() : null,
        triggeredBy,
      },
      update: {
        enabled,
        reason,
        triggeredAt: enabled ? new Date() : null,
        triggeredBy,
      },
    });
  }

  async isKilled(scope: string, targetId?: string | null): Promise<boolean> {
    const globalKill = await this.prisma.killSwitch.findFirst({
      where: { scope: 'GLOBAL', enabled: true },
    });
    if (globalKill) return true;
    if (!targetId) return false;
    const scoped = await this.prisma.killSwitch.findFirst({
      where: { scope, targetId, enabled: true },
    });
    return !!scoped;
  }
}
