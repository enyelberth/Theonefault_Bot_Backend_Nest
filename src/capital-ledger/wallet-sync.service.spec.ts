import { WalletSyncService } from './wallet-sync.service';

function buildService(opts: {
  fundingRows?: Array<{
    externalId: string;
    symbol: string;
    asset: string;
    income: number;
    time: Date;
  }>;
  interestRows?: any[];
  depositRows?: any[];
  withdrawalRows?: any[];
  dividendRows?: any[];
}) {
  const prisma = {
    capitalEvent: {
      findFirst: jest.fn().mockResolvedValue(null), // sin historial previo -> ventana inicial completa
    },
  } as any;
  const record = jest.fn().mockResolvedValue({});
  const ledger = {
    recordMany: jest.fn(async (inputs: any[]) => {
      for (const i of inputs) await record(i);
      return inputs.length;
    }),
  } as any;
  const walletHistory = {
    fetchMarginInterest: jest.fn().mockResolvedValue(opts.interestRows ?? []),
    fetchDeposits: jest.fn().mockResolvedValue(opts.depositRows ?? []),
    fetchWithdrawals: jest.fn().mockResolvedValue(opts.withdrawalRows ?? []),
    fetchDividends: jest.fn().mockResolvedValue(opts.dividendRows ?? []),
    fetchFundingFees: jest.fn().mockResolvedValue(opts.fundingRows ?? []),
  } as any;
  const service = new WalletSyncService(prisma, ledger, walletHistory);
  return { service, ledger, walletHistory, record };
}

describe('WalletSyncService -- funding fees', () => {
  it('records a FUNDING CapitalEvent per income row, preserving its sign', async () => {
    const { service, record, walletHistory } = buildService({
      fundingRows: [
        {
          externalId: 'funding:1',
          symbol: 'BTCUSDT',
          asset: 'USDT',
          income: -0.5, // pagado
          time: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          externalId: 'funding:2',
          symbol: 'BTCUSDT',
          asset: 'USDT',
          income: 0.2, // cobrado
          time: new Date('2026-01-01T08:00:00.000Z'),
        },
      ],
    });

    const result = await service.syncAll(Date.now());

    expect(result.funding).toBe(2);
    expect(walletHistory.fetchFundingFees).toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FUNDING', amount: -0.5, currency: 'USDT' }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FUNDING', amount: 0.2, currency: 'USDT' }),
    );
  });

  it('does not blow up syncAll when the funding fetch fails', async () => {
    const { service, walletHistory } = buildService({});
    walletHistory.fetchFundingFees.mockRejectedValue(new Error('binance down'));

    const result = await service.syncAll(Date.now());

    expect(result.funding).toBe(0);
  });

  it('includes funding in the combined syncAll totals alongside interest/deposits/withdrawals/rebates', async () => {
    const { service } = buildService({
      fundingRows: [
        {
          externalId: 'funding:1',
          symbol: 'ETHUSDT',
          asset: 'USDT',
          income: -1,
          time: new Date(),
        },
      ],
    });

    const result = await service.syncAll(Date.now());

    expect(result).toEqual({
      interest: 0,
      deposits: 0,
      withdrawals: 0,
      rebates: 0,
      funding: 1,
    });
  });
});
