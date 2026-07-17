export interface RiskContext {
  accountEquity: number;
  freeMargin: number;
  usedMargin: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  maxPositionSizePct: number;
  maxDailyLossPct: number;
  dailyPnl: number;
  openPositionsCount: number;
  maxOpenPositions: number;
  killSwitchEnabled: boolean;
  timestamp: number;
}

export type RiskDecision =
  | { allowed: true }
  | { allowed: false; reason: string; code: RiskRejectCode };

export type RiskRejectCode =
  | 'KILL_SWITCH'
  | 'MAX_DRAWDOWN'
  | 'MAX_DAILY_LOSS'
  | 'MAX_POSITIONS'
  | 'MAX_POSITION_SIZE'
  | 'INSUFFICIENT_MARGIN'
  | 'INVALID_SIGNAL';
