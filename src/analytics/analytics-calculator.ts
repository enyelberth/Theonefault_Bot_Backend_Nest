import type {
  AnalyticsMetrics,
  AnalyticsResult,
  AnalyticsTrade,
  EquityPoint,
} from './analytics.types';

const mean = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const sampleDeviation = (values: number[]): number => {
  if (values.length < 2) return 0;
  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
};

const downsideDeviation = (values: number[]): number => {
  const downside = values.filter((value) => value < 0);
  if (downside.length === 0) return 0;
  return Math.sqrt(
    downside.reduce((sum, value) => sum + value ** 2, 0) / downside.length,
  );
};

const round = (value: number, decimals = 8): number => {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

function calculateStreaks(trades: AnalyticsTrade[]): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
} {
  let wins = 0;
  let losses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  for (const trade of trades) {
    if (trade.pnl > 0) {
      wins += 1;
      losses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, wins);
    } else if (trade.pnl < 0) {
      losses += 1;
      wins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, losses);
    } else {
      wins = 0;
      losses = 0;
    }
  }
  return { maxConsecutiveWins, maxConsecutiveLosses };
}

export function calculateAnalytics(
  inputTrades: AnalyticsTrade[],
  initialEquity = 0,
): AnalyticsResult {
  const trades = [...inputTrades].sort(
    (a, b) => a.closedAt.getTime() - b.closedAt.getTime() || a.id - b.id,
  );
  let equity = initialEquity;
  let peak = initialEquity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let cumulativePnl = 0;
  let cumulativeFees = 0;
  const equityCurve: EquityPoint[] = [
    {
      timestamp: (trades[0]?.openedAt ?? new Date()).toISOString(),
      tradeId: null,
      equity: round(initialEquity),
      netPnl: 0,
      drawdown: 0,
      drawdownPct: 0,
      cumulativeFees: 0,
      cumulativeGross: 0,
    },
  ];

  for (const trade of trades) {
    cumulativePnl += trade.pnl;
    cumulativeFees += trade.fees;
    equity = initialEquity + cumulativePnl;
    peak = Math.max(peak, equity);
    const drawdown = Math.max(0, peak - equity);
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    equityCurve.push({
      timestamp: trade.closedAt.toISOString(),
      tradeId: trade.id,
      equity: round(equity),
      netPnl: round(cumulativePnl),
      drawdown: round(drawdown),
      drawdownPct: round(drawdownPct),
      cumulativeFees: round(cumulativeFees),
      cumulativeGross: round(cumulativePnl + cumulativeFees),
    });
  }

  const winning = trades.filter((trade) => trade.pnl > 0);
  const losing = trades.filter((trade) => trade.pnl < 0);
  const breakeven = trades.length - winning.length - losing.length;
  const grossProfit = winning.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losing.reduce((sum, trade) => sum + trade.pnl, 0));
  const netPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const totalFees = trades.reduce((sum, trade) => sum + trade.fees, 0);
  const averageWin = winning.length > 0 ? grossProfit / winning.length : 0;
  const averageLoss = losing.length > 0 ? grossLoss / losing.length : 0;
  const maes = trades.flatMap((trade) =>
    trade.mae === null ? [] : [Math.abs(trade.mae)],
  );
  const mfes = trades.flatMap((trade) =>
    trade.mfe === null ? [] : [Math.abs(trade.mfe)],
  );
  const averageMae = maes.length > 0 ? mean(maes) : null;
  const averageMfe = mfes.length > 0 ? mean(mfes) : null;
  const returns = trades.flatMap((trade) => {
    const notional = trade.entryPrice * trade.quantity;
    return notional > 0 ? [trade.pnl / notional] : [];
  });
  const deviation = sampleDeviation(returns);
  const downside = downsideDeviation(returns);
  const averageReturn = mean(returns);
  const scaling = Math.sqrt(Math.max(returns.length, 1));
  const { maxConsecutiveWins, maxConsecutiveLosses } = calculateStreaks(trades);
  const rValues = trades.flatMap((trade) => {
    if (trade.rMultiple !== null) return [trade.rMultiple];
    if (trade.initialRisk !== null && trade.initialRisk > 0) {
      return [trade.pnl / trade.initialRisk];
    }
    return [];
  });
  const totalR = rValues.length > 0 ? rValues.reduce((s, v) => s + v, 0) : null;
  const averageR = rValues.length > 0 ? mean(rValues) : null;
  const feeDragPct =
    netPnl + totalFees !== 0
      ? (totalFees / Math.abs(netPnl + totalFees)) * 100
      : null;

  const metrics: AnalyticsMetrics = {
    initialEquity: round(initialEquity),
    finalEquity: round(initialEquity + netPnl),
    netPnl: round(netPnl),
    grossPnlBeforeFees: round(netPnl + totalFees),
    totalFees: round(totalFees),
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    breakevenTrades: breakeven,
    winRatePct: round(
      trades.length > 0 ? (winning.length / trades.length) * 100 : 0,
    ),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    expectancy: round(trades.length > 0 ? netPnl / trades.length : 0),
    averageWin: round(averageWin),
    averageLoss: round(averageLoss),
    payoffRatio: averageLoss > 0 ? round(averageWin / averageLoss) : null,
    largestWin: round(
      winning.reduce((max, trade) => Math.max(max, trade.pnl), 0),
    ),
    largestLoss: round(
      losing.reduce((min, trade) => Math.min(min, trade.pnl), 0),
    ),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    averageHoldMinutes: round(
      trades.length > 0
        ? mean(
            trades.map(
              (trade) =>
                (trade.closedAt.getTime() - trade.openedAt.getTime()) / 60_000,
            ),
          )
        : 0,
    ),
    averageMae: averageMae === null ? null : round(averageMae),
    averageMfe: averageMfe === null ? null : round(averageMfe),
    edgeRatio:
      averageMae !== null && averageMae > 0 && averageMfe !== null
        ? round(averageMfe / averageMae)
        : null,
    sharpeRatio:
      deviation > 0 ? round((averageReturn / deviation) * scaling) : null,
    sortinoRatio:
      downside > 0 ? round((averageReturn / downside) * scaling) : null,
    maxDrawdown: round(maxDrawdown),
    maxDrawdownPct: round(maxDrawdownPct),
    recoveryFactor: maxDrawdown > 0 ? round(netPnl / maxDrawdown) : null,
    tradesWithRisk: rValues.length,
    totalR: totalR === null ? null : round(totalR),
    averageR: averageR === null ? null : round(averageR),
    expectancyR: averageR === null ? null : round(averageR),
    bestR: rValues.length > 0 ? round(Math.max(...rValues)) : null,
    worstR: rValues.length > 0 ? round(Math.min(...rValues)) : null,
    feeDragPct: feeDragPct === null ? null : round(feeDragPct),
  };

  return { metrics, equityCurve };
}
