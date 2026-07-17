import type { BacktestMetrics, EquityPoint, SimulatedTrade } from './types';

const PERIODS_PER_YEAR = 365;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function downsideDev(xs: number[]): number {
  const neg = xs.filter((x) => x < 0);
  if (neg.length < 2) return 0;
  return Math.sqrt(neg.reduce((acc, x) => acc + x ** 2, 0) / neg.length);
}

export function buildEquityCurve(
  initialEquity: number,
  trades: SimulatedTrade[],
): EquityPoint[] {
  const points: EquityPoint[] = [];
  let equity = initialEquity;
  let peak = initialEquity;
  points.push({ t: trades[0]?.entryTime ?? Date.now(), equity, drawdownPct: 0 });
  for (const trade of trades) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    points.push({ t: trade.exitTime, equity, drawdownPct: dd });
  }
  return points;
}

export function computeMetrics(
  trades: SimulatedTrade[],
  equityCurve: EquityPoint[],
  initialQuote: number,
  startTime: number,
  endTime: number,
): BacktestMetrics {
  const finalEquity =
    equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialQuote;
  const totalReturnPct = ((finalEquity - initialQuote) / initialQuote) * 100;

  const years = Math.max((endTime - startTime) / (365 * 24 * 60 * 60 * 1000), 1 / 365);
  const cagr = initialQuote > 0 ? (Math.pow(finalEquity / initialQuote, 1 / years) - 1) * 100 : 0;

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const totalWin = wins.reduce((a, b) => a + b.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;
  const averageWin = wins.length ? totalWin / wins.length : 0;
  const averageLoss = losses.length ? totalLoss / losses.length : 0;
  const expectancy =
    trades.length
      ? (winRate / 100) * averageWin - (1 - winRate / 100) * averageLoss
      : 0;

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    const curr = equityCurve[i].equity;
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  const rMean = mean(returns);
  const rStd = stdDev(returns);
  const rDown = downsideDev(returns);
  const sharpeRatio = rStd > 0 ? (rMean / rStd) * Math.sqrt(PERIODS_PER_YEAR) : 0;
  const sortinoRatio = rDown > 0 ? (rMean / rDown) * Math.sqrt(PERIODS_PER_YEAR) : 0;

  const maxDrawdownPct = equityCurve.reduce((max, p) => Math.max(max, p.drawdownPct), 0);
  const averageBarsHeld = trades.length
    ? trades.reduce((a, t) => a + t.bars, 0) / trades.length
    : 0;
  const totalFees = trades.reduce((a, t) => a + t.fees, 0);

  return {
    initialQuote,
    finalQuote: finalEquity,
    totalReturnPct,
    cagr,
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate,
    averageWin,
    averageLoss,
    largestWin: wins.reduce((m, t) => Math.max(m, t.pnl), 0),
    largestLoss: losses.reduce((m, t) => Math.min(m, t.pnl), 0),
    profitFactor,
    expectancy,
    sharpeRatio,
    sortinoRatio,
    maxDrawdownPct,
    averageBarsHeld,
    totalFees,
  };
}
