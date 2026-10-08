import { calculateAnalytics } from './analytics-calculator';
import type { AnalyticsTrade } from './analytics.types';

const trade = (
  id: number,
  pnl: number,
  fees: number,
  mae: number | null,
  mfe: number | null,
): AnalyticsTrade => ({
  id,
  runId: 'run-1',
  strategyId: 'sma-cross',
  mode: 'paper',
  symbol: 'BTCUSDT',
  side: 'BUY',
  entryPrice: 100,
  exitPrice: 101,
  quantity: 10,
  pnl,
  pnlPct: pnl / 10,
  fees,
  mae,
  mfe,
  initialRisk: null,
  rMultiple: null,
  openedAt: new Date(`2026-07-20T0${id}:00:00.000Z`),
  closedAt: new Date(`2026-07-20T0${id + 1}:00:00.000Z`),
  reason: 'test',
  marketRegime: 'BULL_TREND_NORMAL_VOL',
});

describe('calculateAnalytics', () => {
  it('calculates profitability, streaks, excursions and drawdown', () => {
    const result = calculateAnalytics(
      [
        trade(1, 100, 2, -20, 150),
        trade(2, 50, 2, -10, 80),
        trade(3, -40, 2, -30, 20),
        trade(4, -60, 2, -40, 10),
        trade(5, 0, 2, 0, 0),
      ],
      1000,
    );

    expect(result.metrics).toEqual(
      expect.objectContaining({
        initialEquity: 1000,
        finalEquity: 1050,
        netPnl: 50,
        grossPnlBeforeFees: 60,
        totalFees: 10,
        totalTrades: 5,
        winningTrades: 2,
        losingTrades: 2,
        breakevenTrades: 1,
        winRatePct: 40,
        grossProfit: 150,
        grossLoss: 100,
        profitFactor: 1.5,
        expectancy: 10,
        averageWin: 75,
        averageLoss: 50,
        payoffRatio: 1.5,
        largestWin: 100,
        largestLoss: -60,
        maxConsecutiveWins: 2,
        maxConsecutiveLosses: 2,
        averageHoldMinutes: 60,
        averageMae: 20,
        averageMfe: 52,
        edgeRatio: 2.6,
        maxDrawdown: 100,
        maxDrawdownPct: 8.69565217,
        recoveryFactor: 0.5,
        tradesWithRisk: 0,
        totalR: null,
        averageR: null,
        expectancyR: null,
        bestR: null,
        worstR: null,
        feeDragPct: 16.66666667,
      }),
    );
    expect(result.metrics.sharpeRatio).not.toBeNull();
    expect(result.metrics.sortinoRatio).not.toBeNull();
    expect(result.equityCurve).toHaveLength(6);
    expect(result.equityCurve.at(-1)).toEqual(
      expect.objectContaining({ equity: 1050, netPnl: 50, drawdown: 100 }),
    );
  });

  it('returns safe values when no closed trades exist', () => {
    const result = calculateAnalytics([], 500);

    expect(result.metrics.totalTrades).toBe(0);
    expect(result.metrics.finalEquity).toBe(500);
    expect(result.metrics.profitFactor).toBeNull();
    expect(result.metrics.sharpeRatio).toBeNull();
    expect(result.metrics.totalR).toBeNull();
    expect(result.metrics.feeDragPct).toBeNull();
    expect(result.equityCurve).toHaveLength(1);
  });

  it('aggregates R-multiple across trades with risk', () => {
    const risky = (id: number, pnl: number, initialRisk: number) => ({
      ...trade(id, pnl, 1, null, null),
      initialRisk,
      rMultiple: pnl / initialRisk,
    });
    const result = calculateAnalytics(
      [risky(1, 200, 100), risky(2, -50, 100), risky(3, 150, 50)],
      1000,
    );

    expect(result.metrics.tradesWithRisk).toBe(3);
    expect(result.metrics.totalR).toBe(4.5);
    expect(result.metrics.averageR).toBe(1.5);
    expect(result.metrics.bestR).toBe(3);
    expect(result.metrics.worstR).toBe(-0.5);
  });

  it('tracks cumulativeFees on equity curve points', () => {
    const result = calculateAnalytics(
      [trade(1, 100, 5, null, null), trade(2, -30, 5, null, null)],
      1000,
    );
    const points = result.equityCurve;
    expect(points[1].cumulativeFees).toBe(5);
    expect(points[2].cumulativeFees).toBe(10);
    expect(points[2].cumulativeGross).toBe(80);
  });
});
