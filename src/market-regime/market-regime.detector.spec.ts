import type { Candle } from '../exchanges/domain';
import { detectMarketRegime } from './market-regime.detector';
import { MarketRegimeService } from './market-regime.service';

const candles = (closeAt: (index: number) => number, count = 100): Candle[] =>
  Array.from({ length: count }, (_, index) => {
    const close = closeAt(index);
    return {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      openTime: index * 3_600_000,
      closeTime: (index + 1) * 3_600_000,
      open: close - 0.1,
      high: close + 0.3,
      low: close - 0.3,
      close,
      volume: 100,
      closed: true,
    };
  });

describe('market regime detector', () => {
  it('identifies a persistent bullish trend', () => {
    const result = detectMarketRegime(
      'BTCUSDT',
      '1h',
      candles((index) => 100 + index * 0.5),
    );

    expect(result.trend).toBe('BULL_TREND');
    expect(result.regime).toContain('BULL_TREND');
    expect(result.confidence).toBeGreaterThan(60);
    expect(result.efficiencyRatio).toBeCloseTo(1);
  });

  it('returns unknown instead of inventing a regime without enough data', () => {
    const result = detectMarketRegime(
      'BTCUSDT',
      '1h',
      candles((index) => 100 + index, 20),
    );

    expect(result.trend).toBe('UNKNOWN');
    expect(result.confidence).toBeLessThanOrEqual(40);
  });

  it('enforces configured confidence, trend and volatility filters', () => {
    const service = new MarketRegimeService({} as never);
    const result = detectMarketRegime(
      'BTCUSDT',
      '1h',
      candles((index) => 100 + index * 0.5),
    );

    expect(
      service.allows(result, {
        enabled: true,
        allowedTrends: ['BULL_TREND'],
        minConfidence: 60,
      }),
    ).toBe(true);
    expect(
      service.allows(result, {
        enabled: true,
        allowedTrends: ['BEAR_TREND'],
      }),
    ).toBe(false);
    expect(
      service.allows(result, {
        enabled: true,
        blockedVolatility: [result.volatility],
      }),
    ).toBe(false);
  });
});
