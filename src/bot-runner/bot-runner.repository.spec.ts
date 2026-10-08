import { BotRunnerRepository } from './bot-runner.repository';

describe('BotRunnerRepository traceability', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const createExecution = jest.fn();
  const upsertRun = jest.fn();
  const prisma = {
    botRunnerTrace: { create, findMany },
    executionMetric: { create: createExecution },
    botRunnerRun: { upsert: upsertRun },
  };
  const repository = new BotRunnerRepository(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('persists a correlated trace event and removes undefined JSON fields', async () => {
    create.mockResolvedValue({ id: 1 });

    await repository.createTrace({
      botRunnerRunId: 7,
      correlationId: 'signal-123',
      eventType: 'RISK_ALLOWED',
      symbol: 'BTCUSDT',
      payload: { allowed: true, optional: undefined },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        botRunnerRunId: 7,
        correlationId: 'signal-123',
        eventType: 'RISK_ALLOWED',
        symbol: 'BTCUSDT',
        payload: { allowed: true },
      }),
    });
  });

  it('returns a chronological, bounded trace', async () => {
    findMany.mockResolvedValue([]);

    await repository.listTraces(7, {
      correlationId: 'signal-123',
      eventType: 'ORDER_FILLED',
      limit: 99_999,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        botRunnerRunId: 7,
        correlationId: 'signal-123',
        eventType: 'ORDER_FILLED',
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: 2000,
    });
  });

  it('persists observed execution quality with decimal-safe values', async () => {
    createExecution.mockResolvedValue({ id: 2 });
    const requestedAt = new Date('2026-07-21T10:00:00.000Z');
    const respondedAt = new Date('2026-07-21T10:00:00.125Z');

    await repository.createExecutionMetric({
      botRunnerRunId: 7,
      correlationId: 'signal-456',
      orderId: 'order-9',
      exchange: 'binance-paper',
      mode: 'paper',
      symbol: 'BTCUSDT',
      side: 'BUY',
      orderType: 'MARKET',
      status: 'FILLED',
      expectedPrice: 100,
      fillPrice: 100.05,
      filledQuantity: 2,
      slippageBps: 5,
      slippageQuote: 0.1,
      fee: 0.2,
      latencyMs: 125,
      requestedAt,
      respondedAt,
    });

    expect(createExecution).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correlationId: 'signal-456',
        orderId: 'order-9',
        status: 'FILLED',
        latencyMs: 125,
        requestedAt,
        respondedAt,
      }),
    });
    const data = createExecution.mock.calls[0][0].data;
    expect(data.expectedPrice.toString()).toBe('100');
    expect(data.slippageBps.toString()).toBe('5');
    expect(data.fee.toString()).toBe('0.2');
  });

  it('createRun usa upsert por runId: un runId repetido (restart manual o resurrección del reconciler) no debe tirar unique constraint', async () => {
    upsertRun.mockResolvedValue({ id: 1, runId: 'run-1' });

    await repository.createRun({
      runId: 'run-1',
      strategyId: 'grid',
      symbol: 'BTCUSDT',
      timeframe: '1m',
      exchangeMode: 'paper',
      config: { foo: 'bar' },
      initialEquity: 1000,
    });

    const call = upsertRun.mock.calls[0][0];
    expect(call.where).toEqual({ runId: 'run-1' });
    // la rama update NO debe reiniciar peakEquity/dailyPnl/ticks ni nada
    // acumulado: solo reabre el run existente.
    expect(call.update).toEqual(
      expect.objectContaining({
        status: 'RUNNING',
        stoppedAt: null,
        lastError: null,
      }),
    );
    expect(call.update.peakEquity).toBeUndefined();
    expect(call.update.initialEquity).toBeUndefined();
  });
});
