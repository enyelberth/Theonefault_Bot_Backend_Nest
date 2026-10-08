import { evaluateTimeframeAlignment } from './multi-timeframe';
import type { MarketRegimeResult } from './market-regime.types';

const regime = (
  trend: MarketRegimeResult['trend'],
  confidence = 100,
): MarketRegimeResult => ({
  symbol: 'BTCUSDT',
  timeframe: '1h',
  candleCloseTime: 1,
  regime: `${trend}_NORMAL_VOL`,
  trend,
  volatility: 'NORMAL',
  volume: 'NORMAL',
  confidence,
  trendStrengthPct: 1,
  atrPct: 1,
  efficiencyRatio: 1,
  volumeRatio: 1,
  indicators: {
    ema20: 1,
    ema50: 1,
    atr14: 1,
    baselineRangePct: 1,
    samples: 100,
  },
});

describe('multi-timeframe alignment', () => {
  it('approves aligned bullish contexts for a buy', () => {
    const result = evaluateTimeframeAlignment(
      'BUY',
      [
        { timeframe: '5m', weight: 1, regime: regime('BULL_TREND', 90) },
        { timeframe: '1h', weight: 2, regime: regime('BULL_TREND', 80) },
        { timeframe: '4h', weight: 3, regime: regime('BULL_TREND', 90) },
      ],
      70,
      60,
    );
    expect(result.aligned).toBe(true);
    expect(result.score).toBeGreaterThan(80);
  });

  it('rejects an entry opposed by the higher timeframe', () => {
    const result = evaluateTimeframeAlignment(
      'BUY',
      [
        { timeframe: '5m', weight: 1, regime: regime('BULL_TREND') },
        { timeframe: '4h', weight: 3, regime: regime('BEAR_TREND') },
      ],
      60,
    );
    expect(result.aligned).toBe(false);
    expect(result.score).toBeLessThan(50);
  });
});
