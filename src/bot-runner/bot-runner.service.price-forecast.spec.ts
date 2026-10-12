import { BotRunnerService } from './bot-runner.service';

function buildService(forecasts: { current: jest.Mock }) {
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
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({}),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(allowed).toBe(true);
    expect(current).not.toHaveBeenCalled();
  });

  it('never gates exit/non-entry signals, even when enabled', async () => {
    const current = jest.fn();
    const { service } = buildService({ current });
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true } }),
      buildSignal('SELL', 'CLOSE'),
      false,
      'c1',
    );
    expect(allowed).toBe(true);
    expect(current).not.toHaveBeenCalled();
  });

  it('blocks a BUY when the AR+GARCH forecast expects a drop beyond maxDivergencePct', async () => {
    const current = jest.fn().mockResolvedValue(okForecastResponse(97));
    const { service, createTrace } = buildService({ current });
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(allowed).toBe(false);
    expect(createTrace).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PRICE_FORECAST_REJECTED' }),
    );
  });

  it('allows a BUY when the expected drop is within tolerance', async () => {
    const current = jest.fn().mockResolvedValue(okForecastResponse(99.5));
    const { service } = buildService({ current });
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(allowed).toBe(true);
  });

  it('blocks a SELL when the forecast expects a rise beyond maxDivergencePct', async () => {
    const current = jest.fn().mockResolvedValue(okForecastResponse(103));
    const { service } = buildService({ current });
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('SELL'),
      true,
      'c1',
    );
    expect(allowed).toBe(false);
  });

  it('fails open (allows) when the forecast lookup throws', async () => {
    const current = jest.fn().mockRejectedValue(new Error('db down'));
    const { service } = buildService({ current });
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({ priceForecast: { enabled: true, maxDivergencePct: 1 } }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(allowed).toBe(true);
  });

  it('honors allowInsufficientData=false when there is not enough candle history', async () => {
    const current = jest.fn().mockResolvedValue({
      status: 'INSUFFICIENT_DATA',
      forecast: { status: 'INSUFFICIENT_DATA' },
    });
    const { service } = buildService({ current });
    const allowed = await (service as any).checkPriceForecast(
      buildHandle({
        priceForecast: { enabled: true, allowInsufficientData: false },
      }),
      buildSignal('BUY'),
      true,
      'c1',
    );
    expect(allowed).toBe(false);
  });
});
