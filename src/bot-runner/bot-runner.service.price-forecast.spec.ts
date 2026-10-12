import { BotRunnerService } from './bot-runner.service';

function buildService(forecasts: {
  current: jest.Mock;
  accuracySummary?: jest.Mock;
}) {
  const createTrace = jest.fn().mockResolvedValue({});
  const repo = { createTrace } as any;
  const dummy = {} as any;
  const service = new BotRunnerService(
    dummy, // registry
    dummy, // selector
    dummy, // risk
    repo,
    dummy, // copyBus
    dummy, // regimes
    dummy, // klines
    dummy, // alerts
    dummy, // ledger
    forecasts as any,
    dummy, // confluence
  );
  return { service, createTrace };
}

function buildHandle(config: Record<string, unknown>) {
  return {
    dbRun: { id: 1 },
    input: { runId: 'r1', symbol: 'BTCUSDT', timeframe: '1m', config },
  } as any;
}

function buildSignal(side: 'BUY' | 'SELL', action: 'OPEN' | 'CLOSE' = 'OPEN') {
  return {
    action,
    symbol: 'BTCUSDT',
    side,
    price: 100,
    emittedAt: Date.now(),
  } as any;
}

function okForecastResponse(forecastPrice: number) {
  return {
    status: 'OK',
    forecast: {
      status: 'OK',
      lastPrice: 100,
      forecastPrice,
      lowerBound: forecastPrice - 2,
      upperBound: forecastPrice + 2,
      confidencePct: 95,
      volatilityForecast: 0.01,
      modelType: 'AR+GARCH',
      modelParams: null,
      samplesUsed: 300,
    },
  };
}

describe('BotRunnerService.checkPriceForecast', () => {
  it('allows the signal when config.priceForecast is not enabled', async () => {
    const current = jest.fn();
    const { service } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({}),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(result.allowed).toBe(true);
    expect(current).not.toHaveBeenCalled();
  });

  it('never gates exit/non-entry signals, even when enabled', async () => {
    const current = jest.fn();
    const { service } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true } }),
      buildSignal('SELL', 'CLOSE'),
      false,
      'c1',
    );
    expect(result.allowed).toBe(true);
    expect(current).not.toHaveBeenCalled();
  });

  it('blocks a BUY when the AR+GARCH forecast expects a drop beyond maxDivergencePct', async () => {
    const current = jest.fn().mockResolvedValue(okForecastResponse(97));
    const { service, createTrace } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(result.allowed).toBe(false);
    expect(createTrace).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PRICE_FORECAST_REJECTED' }),
    );
  });

  it('allows a BUY when the expected drop is within tolerance', async () => {
    const current = jest.fn().mockResolvedValue(okForecastResponse(99.5));
    const { service } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(result.allowed).toBe(true);
  });

  it('blocks a SELL when the forecast expects a rise beyond maxDivergencePct', async () => {
    const current = jest.fn().mockResolvedValue(okForecastResponse(103));
    const { service } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('SELL'),
      true,
      'c1',
    );
    expect(result.allowed).toBe(false);
  });

  it('fails open (allows) when the forecast lookup throws', async () => {
    const current = jest.fn().mockRejectedValue(new Error('db down'));
    const { service } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(result.allowed).toBe(true);
  });

  it('honors allowInsufficientData=false when there is not enough candle history', async () => {
    const current = jest.fn().mockResolvedValue({
      status: 'INSUFFICIENT_DATA',
      forecast: { status: 'INSUFFICIENT_DATA' },
    });
    const { service } = buildService({ current });
    const result = await (service as any).checkPriceForecast(
      buildHandle({
        priceForecast: { enabled: true, allowInsufficientData: false },
      }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(result.allowed).toBe(false);
  });

  describe('sizeConfidence (walk-forward accuracy -> position size multiplier)', () => {
    const sizeConfidenceConfig = {
      enabled: true,
      minSampleSize: 30,
      floorMultiplier: 0.25,
      ceilingMultiplier: 1.5,
    };

    it('does not query accuracy or touch the signal when sizeConfidence is not configured', async () => {
      const current = jest.fn().mockResolvedValue(okForecastResponse(100));
      const accuracySummary = jest.fn();
      const { service } = buildService({ current, accuracySummary });
      const result = await (service as any).checkPriceForecast(
        buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
        buildSignal('BUY'),
        true,
        'c1',
      );
      expect(result.allowed).toBe(true);
      expect(accuracySummary).not.toHaveBeenCalled();
      expect(result.signal.metadata?.forecastSizeMultiplier).toBeUndefined();
    });

    it('attaches a >1 multiplier to the signal when walk-forward accuracy is well above 50% with enough samples', async () => {
      const current = jest.fn().mockResolvedValue(okForecastResponse(100));
      const accuracySummary = jest.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        timeframe: '1m',
        horizonBars: 5,
        newlyEvaluated: 0,
        sampleSize: 100,
        mae: 1,
        rmse: 1,
        directionalAccuracyPct: 75,
      });
      const { service } = buildService({ current, accuracySummary });
      const result = await (service as any).checkPriceForecast(
        buildHandle({
          priceForecast: {
            enabled: true,
            maxDivergencePct: 1,
            sizeConfidence: sizeConfidenceConfig,
          },
        }),
        buildSignal('BUY'),
        true,
        'c1',
      );
      expect(result.allowed).toBe(true);
      expect(result.signal.metadata?.forecastSizeMultiplier).toBeCloseTo(1.25, 6);
    });

    it('attaches a <1 multiplier when walk-forward accuracy is well below 50%', async () => {
      const current = jest.fn().mockResolvedValue(okForecastResponse(100));
      const accuracySummary = jest.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        timeframe: '1m',
        horizonBars: 5,
        newlyEvaluated: 0,
        sampleSize: 100,
        mae: 1,
        rmse: 1,
        directionalAccuracyPct: 25,
      });
      const { service } = buildService({ current, accuracySummary });
      const result = await (service as any).checkPriceForecast(
        buildHandle({
          priceForecast: {
            enabled: true,
            maxDivergencePct: 1,
            sizeConfidence: sizeConfidenceConfig,
          },
        }),
        buildSignal('BUY'),
        true,
        'c1',
      );
      expect(result.allowed).toBe(true);
      expect(result.signal.metadata?.forecastSizeMultiplier).toBeCloseTo(0.625, 6);
    });

    it('stays neutral (multiplier 1) when the walk-forward sample is too small to trust', async () => {
      const current = jest.fn().mockResolvedValue(okForecastResponse(100));
      const accuracySummary = jest.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        timeframe: '1m',
        horizonBars: 5,
        newlyEvaluated: 0,
        sampleSize: 5,
        mae: 1,
        rmse: 1,
        directionalAccuracyPct: 90,
      });
      const { service } = buildService({ current, accuracySummary });
      const result = await (service as any).checkPriceForecast(
        buildHandle({
          priceForecast: {
            enabled: true,
            maxDivergencePct: 1,
            sizeConfidence: sizeConfidenceConfig,
          },
        }),
        buildSignal('BUY'),
        true,
        'c1',
      );
      expect(result.allowed).toBe(true);
      expect(result.signal.metadata?.forecastSizeMultiplier).toBe(1);
    });

    it('does not compute a multiplier when the signal was rejected by the divergence filter', async () => {
      const current = jest.fn().mockResolvedValue(okForecastResponse(97));
      const accuracySummary = jest.fn();
      const { service } = buildService({ current, accuracySummary });
      const result = await (service as any).checkPriceForecast(
        buildHandle({
          priceForecast: {
            enabled: true,
            maxDivergencePct: 1,
            sizeConfidence: sizeConfidenceConfig,
          },
        }),
        buildSignal('BUY'),
        true,
        'c1',
      );
      expect(result.allowed).toBe(false);
      expect(accuracySummary).not.toHaveBeenCalled();
    });
  });
});
