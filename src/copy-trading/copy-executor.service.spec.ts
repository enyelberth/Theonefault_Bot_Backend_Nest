import { CopyMode } from '@prisma/client';
import { CopyExecutorService } from './copy-executor.service';

describe('CopyExecutorService', () => {
  const baseSub: any = {
    id: 1,
    masterId: 1,
    followerRunId: 'run-1',
    exchangeMode: 'real',
    exchangeId: 'binance',
    paperAccountId: null,
    mode: CopyMode.MIRROR,
    sizeMultiplier: 1,
    fixedQuote: null,
    maxRiskPct: 10,
    active: true,
  };

  const baseSignal: any = {
    action: 'OPEN',
    symbol: 'BTCUSDT',
    side: 'BUY',
    type: 'MARKET',
    quantity: 1,
    quoteQuantity: 100,
    emittedAt: Date.now(),
  };

  function buildService(opts: {
    riskAllowed: boolean;
    riskCode?: string;
    adjustedSignal?: any;
    killed?: boolean;
  }) {
    const placeOrder = jest.fn().mockResolvedValue({
      id: 'order-1',
      averagePrice: 100,
      filledQuantity: 1,
      quoteQuantity: 100,
    });
    const exchange = {
      placeOrder,
      cancelAllOrders: jest.fn().mockResolvedValue(undefined),
      getBalance: jest
        .fn()
        .mockResolvedValue({ totalValueUsd: 1000, balances: [] }),
      getPositions: jest.fn().mockResolvedValue([]),
    };
    const selector = { resolve: jest.fn().mockReturnValue(exchange) } as any;
    const repo = { recordExecution: jest.fn().mockResolvedValue({}) } as any;
    const risk = {
      isKilled: jest.fn().mockResolvedValue(opts.killed ?? false),
      loadProfile: jest.fn().mockResolvedValue(null),
      check: jest.fn().mockResolvedValue({
        decision: opts.riskAllowed
          ? { allowed: true }
          : {
              allowed: false,
              code: opts.riskCode ?? 'MAX_DAILY_LOSS',
              reason: 'blocked',
            },
        adjustedSignal: opts.adjustedSignal,
      }),
    } as any;
    const botRunnerRepo = {
      byRunId: jest
        .fn()
        .mockResolvedValue({ id: 10, riskProfileId: null, peakEquity: 1000 }),
      computeDailyPnl: jest.fn().mockResolvedValue(0),
    } as any;

    const service = new CopyExecutorService(
      selector,
      repo,
      risk,
      botRunnerRepo,
    );
    return { service, placeOrder, repo, risk, exchange, botRunnerRepo };
  }

  it('coloca la orden cuando el motor de riesgo central permite la señal', async () => {
    const { service, placeOrder, risk } = buildService({ riskAllowed: true });

    const result = await service.dispatch({
      copyEventId: 1,
      masterRunId: 'master-1',
      masterEquity: 1000,
      signal: baseSignal,
      subscription: baseSub,
    });

    expect(risk.check).toHaveBeenCalled();
    expect(placeOrder).toHaveBeenCalled();
    expect(result.status).toBe('FILLED');
  });

  it('NUNCA coloca la orden cuando el motor de riesgo central la rechaza', async () => {
    const { service, placeOrder, risk } = buildService({
      riskAllowed: false,
      riskCode: 'MAX_DAILY_LOSS',
    });

    const result = await service.dispatch({
      copyEventId: 1,
      masterRunId: 'master-1',
      masterEquity: 1000,
      signal: baseSignal,
      subscription: baseSub,
    });

    expect(risk.check).toHaveBeenCalled();
    expect(placeOrder).not.toHaveBeenCalled();
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toContain('MAX_DAILY_LOSS');
  });

  it('NUNCA coloca la orden cuando el kill switch del follower está activo, sin ni siquiera consultar check()', async () => {
    const { service, placeOrder, risk } = buildService({
      riskAllowed: true,
      killed: true,
    });

    const result = await service.dispatch({
      copyEventId: 1,
      masterRunId: 'master-1',
      masterEquity: 1000,
      signal: baseSignal,
      subscription: baseSub,
    });

    expect(risk.isKilled).toHaveBeenCalledWith('BOT', baseSub.followerRunId);
    expect(risk.check).not.toHaveBeenCalled();
    expect(placeOrder).not.toHaveBeenCalled();
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toContain('kill switch');
  });

  it('el cap local maxRiskPct sigue aplicando como capa adicional antes de llegar al motor central', async () => {
    const { service, placeOrder, risk, exchange } = buildService({
      riskAllowed: true,
    });
    exchange.getBalance.mockResolvedValue({ totalValueUsd: 50, balances: [] });

    const subWithCap = { ...baseSub, maxRiskPct: 10 }; // cap = 10% de 50 = 5
    const bigSignal = {
      ...baseSignal,
      quoteQuantity: 1000,
      quantity: undefined,
    };

    await service.dispatch({
      copyEventId: 1,
      masterRunId: 'master-1',
      masterEquity: 1000,
      signal: bigSignal,
      subscription: subWithCap,
    });

    const sizedSignalPassedToRisk = risk.check.mock.calls[0][0].signal;
    expect(sizedSignalPassedToRisk.quoteQuantity).toBeLessThanOrEqual(5);
    expect(placeOrder).toHaveBeenCalled();
  });

  it('usa drawdown/dailyLoss/openPositions del riskProfile del follower en vez de un tope fijo en 100', async () => {
    const { service, risk, botRunnerRepo } = buildService({
      riskAllowed: true,
    });
    botRunnerRepo.byRunId.mockResolvedValue({
      id: 10,
      riskProfileId: 7,
      peakEquity: 1000,
    });
    risk.loadProfile.mockResolvedValue({
      maxDrawdownPct: 15,
      maxDailyLossPct: 3,
      maxOpenPositions: 2,
      maxPositionSizePct: 50,
    });

    await service.dispatch({
      copyEventId: 1,
      masterRunId: 'master-1',
      masterEquity: 1000,
      signal: baseSignal,
      subscription: baseSub,
    });

    expect(risk.loadProfile).toHaveBeenCalledWith(7);
    const contextPassedToRisk = risk.check.mock.calls[0][0].context;
    expect(contextPassedToRisk.maxDrawdownPct).toBe(15);
    expect(contextPassedToRisk.maxDailyLossPct).toBe(3);
    expect(contextPassedToRisk.maxOpenPositions).toBe(2);
  });

  it('rechaza la señal si no encuentra el BotRunnerRun del follower', async () => {
    const { service, placeOrder, botRunnerRepo } = buildService({
      riskAllowed: true,
    });
    botRunnerRepo.byRunId.mockRejectedValue(new Error('not found'));

    const result = await service.dispatch({
      copyEventId: 1,
      masterRunId: 'master-1',
      masterEquity: 1000,
      signal: baseSignal,
      subscription: baseSub,
    });

    expect(placeOrder).not.toHaveBeenCalled();
    expect(result.status).toBe('REJECTED');
    expect(result.reason).toContain('follower run not found');
  });
});
