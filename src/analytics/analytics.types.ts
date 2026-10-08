export type AnalyticsGroupBy =
  | 'strategy'
  | 'symbol'
  | 'run'
  | 'mode'
  | 'regime';

export interface AnalyticsFilters {
  ownerId?: number;
  runId?: string;
  strategyId?: string;
  symbol?: string;
  mode?: 'real' | 'paper';
  from?: Date;
  to?: Date;
}

export interface AnalyticsTrade {
  id: number;
  runId: string;
  strategyId: string;
  mode: string;
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  mae: number | null;
  mfe: number | null;
  initialRisk: number | null;
  rMultiple: number | null;
  openedAt: Date;
  closedAt: Date;
  reason: string | null;
  marketRegime: string | null;
}

export interface EquityPoint {
  timestamp: string;
  tradeId: number | null;
  equity: number;
  netPnl: number;
  drawdown: number;
  drawdownPct: number;
  cumulativeFees: number;
  cumulativeGross: number;
}

export interface AnalyticsMetrics {
  initialEquity: number;
  finalEquity: number;
  netPnl: number;
  grossPnlBeforeFees: number;
  totalFees: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRatePct: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  payoffRatio: number | null;
  largestWin: number;
  largestLoss: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  averageHoldMinutes: number;
  averageMae: number | null;
  averageMfe: number | null;
  edgeRatio: number | null;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  recoveryFactor: number | null;
  tradesWithRisk: number;
  totalR: number | null;
  averageR: number | null;
  expectancyR: number | null;
  bestR: number | null;
  worstR: number | null;
  feeDragPct: number | null;
}

export interface AnalyticsResult {
  metrics: AnalyticsMetrics;
  equityCurve: EquityPoint[];
}

export interface ExecutionSample {
  id: number;
  runId: string;
  strategyId: string;
  mode: string;
  symbol: string;
  status: string;
  notional: number | null;
  fee: number;
  spreadBps: number | null;
  slippageBps: number | null;
  slippageQuote: number | null;
  latencyMs: number | null;
}

export interface ExecutionMetrics {
  attempts: number;
  filled: number;
  rejected: number;
  acceptedNotFilled: number;
  fillRatePct: number;
  rejectionRatePct: number;
  totalNotional: number;
  totalFees: number;
  feeBps: number | null;
  totalSlippageQuote: number;
  averageSlippageBps: number | null;
  medianSlippageBps: number | null;
  p95SlippageBps: number | null;
  worstSlippageBps: number | null;
  averageSpreadBps: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
}
