export interface SimulatedTrade {
  side: 'BUY' | 'SELL';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  reason?: string;
  bars: number;
}

export interface EquityPoint {
  t: number;
  equity: number;
  drawdownPct: number;
}

export interface BacktestMetrics {
  initialQuote: number;
  finalQuote: number;
  totalReturnPct: number;
  cagr: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number;
  expectancy: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdownPct: number;
  averageBarsHeld: number;
  totalFees: number;
}
