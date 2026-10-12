import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService.captureBalances (SPOT ledger vs exchange)', () => {
  function buildService(opts: {
    initialEquity: number;
    capitalEventsSum: number;
    remoteBalance: number;
    openTradesCount?: number;
  }) {
    const upsert = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({});
    const prisma = {
      capitalEvent: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: opts.capitalEventsSum } }),
      },
      botRunnerTrade: {
        count: jest.fn().mockResolvedValue(opts.openTradesCount ?? 0),
      },
      reconciliationIssue: { upsert, updateMany },
    } as any;
    const selector = {} as any;
    const exchange = {
      getBalance: jest.fn().mockResolvedValue({
        balances: [
          {
            asset: 'USDT',
            free: opts.remoteBalance,
            locked: 0,
            borrowed: 0,
            interest: 0,
            total: opts.remoteBalance,
          },
        ],
      }),
    } as any;
    const service = new ReconciliationService(prisma, selector);
    const run = {
      id: 1,
      symbol: 'BTCUSDT',
      initialEquity: opts.initialEquity,
    } as any;
    return { service, run, upsert, updateMany, exchange };
  }

  it('does not flag anything when remote balance matches local ledger within tolerance', async () => {
    const { service, run, upsert, exchange } = buildService({
      initialEquity: 1000,
      capitalEventsSum: 50,
      remoteBalance: 1050,
    });

    const result = await (service as any).captureBalances(
      run,
      1,
      'SPOT',
      exchange,
    );

    expect(result.issues).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('flags CRITICAL when remote balance is below the local ledger balance (unexplained loss)', async () => {
    const { service, run, upsert, exchange } = buildService({
      initialEquity: 1000,
      capitalEventsSum: 50,
      remoteBalance: 900, // esperado 1050, faltan 150
    });

    const result = await (service as any).captureBalances(
      run,
      1,
      'SPOT',
      exchange,
    );

    expect(result.issues).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'BALANCE_MISMATCH',
          severity: 'CRITICAL',
        }),
      }),
    );
  });

  it('flags HIGH (not CRITICAL) when remote balance exceeds local ledger balance', async () => {
    const { service, run, upsert, exchange } = buildService({
      initialEquity: 1000,
      capitalEventsSum: 50,
      remoteBalance: 1200, // esperado 1050, exceso 150
    });

    const result = await (service as any).captureBalances(
      run,
      1,
      'SPOT',
      exchange,
    );

    expect(result.issues).toBe(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'BALANCE_MISMATCH',
          severity: 'HIGH',
        }),
      }),
    );
  });

  it('skips the balance comparison for non-SPOT markets (unrealized PnL would cause false positives)', async () => {
    const { service, run, upsert, exchange } = buildService({
      initialEquity: 1000,
      capitalEventsSum: 50,
      remoteBalance: 1,
    });

    const result = await (service as any).captureBalances(
      run,
      1,
      'FUTURES',
      exchange,
    );

    expect(result.issues).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});
