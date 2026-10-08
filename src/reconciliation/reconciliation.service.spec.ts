import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService.reconcilePositions severity', () => {
  function buildService(opts: {
    localQuantity: number;
    remoteQuantity: number;
  }) {
    const localTrades =
      opts.localQuantity > 0
        ? [
            {
              id: 1,
              symbol: 'BTCUSDT',
              side: 'BUY',
              quantity: opts.localQuantity,
            },
          ]
        : [];
    const positions =
      opts.remoteQuantity > 0
        ? [
            {
              symbol: 'BTCUSDT',
              side: 'BUY',
              quantity: opts.remoteQuantity,
              entryPrice: 100,
              markPrice: 100,
              unrealizedPnl: 0,
              market: 'SPOT',
            },
          ]
        : [];

    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      botRunnerTrade: { findMany: jest.fn().mockResolvedValue(localTrades) },
      reconciliationIssue: {
        upsert,
        updateMany: jest.fn().mockResolvedValue({}),
      },
    } as any;
    const selector = {} as any;
    const exchange = {
      getPositions: jest.fn().mockResolvedValue(positions),
    } as any;
    const service = new ReconciliationService(prisma, selector);
    return { service, upsert, exchange };
  }

  it('flags a phantom remote position (no local record) as CRITICAL, not HIGH', async () => {
    const { service, upsert, exchange } = buildService({
      localQuantity: 0,
      remoteQuantity: 1.5,
    });

    await (service as any).reconcilePositions(
      1,
      1,
      'BTCUSDT',
      'SPOT',
      exchange,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'CRITICAL' }),
      }),
    );
  });

  it('flags a phantom local position (exchange reports nothing) as CRITICAL', async () => {
    const { service, upsert, exchange } = buildService({
      localQuantity: 1.5,
      remoteQuantity: 0,
    });

    await (service as any).reconcilePositions(
      1,
      1,
      'BTCUSDT',
      'SPOT',
      exchange,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ severity: 'CRITICAL' }),
      }),
    );
  });
});
