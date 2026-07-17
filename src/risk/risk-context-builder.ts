import type { RiskContext } from '../exchanges/domain';

export interface RiskContextInputs {
  accountEquity: number;
  freeMargin?: number;
  usedMargin?: number;
  dailyPnl?: number;
  currentDrawdownPct?: number;
  openPositionsCount?: number;
  maxDrawdownPct: number;
  maxDailyLossPct: number;
  maxPositionSizePct: number;
  maxOpenPositions: number;
  killSwitchEnabled?: boolean;
}

export function buildRiskContext(input: RiskContextInputs): RiskContext {
  return {
    accountEquity: input.accountEquity,
    freeMargin: input.freeMargin ?? input.accountEquity,
    usedMargin: input.usedMargin ?? 0,
    maxDrawdownPct: input.maxDrawdownPct,
    currentDrawdownPct: input.currentDrawdownPct ?? 0,
    maxPositionSizePct: input.maxPositionSizePct,
    maxDailyLossPct: input.maxDailyLossPct,
    dailyPnl: input.dailyPnl ?? 0,
    openPositionsCount: input.openPositionsCount ?? 0,
    maxOpenPositions: input.maxOpenPositions,
    killSwitchEnabled: input.killSwitchEnabled ?? false,
    timestamp: Date.now(),
  };
}
