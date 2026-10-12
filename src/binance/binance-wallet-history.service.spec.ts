import { BinanceWalletHistoryService } from './binance-wallet-history.service';

describe('BinanceWalletHistoryService.fetchFundingFees', () => {
  it('maps /fapi/v1/income rows (incomeType=FUNDING_FEE) preserving the signed amount', async () => {
    const getSigned = jest.fn().mockResolvedValue([
      { symbol: 'BTCUSDT', incomeType: 'FUNDING_FEE', income: '-0.12345678', asset: 'USDT', tranId: 111, time: 1_700_000_000_000 },
      { symbol: 'ETHUSDT', incomeType: 'FUNDING_FEE', income: '0.05', asset: 'USDT', tranId: 222, time: 1_700_000_100_000 },
    ]);
    const binance = { getSigned } as any;
    const service = new BinanceWalletHistoryService(binance);

    const rows = await service.fetchFundingFees(1_699_999_000_000, 1_700_001_000_000);

    expect(getSigned).toHaveBeenCalledWith(
      '/fapi/v1/income',
      expect.objectContaining({ incomeType: 'FUNDING_FEE' }),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      externalId: 'funding:111',
      symbol: 'BTCUSDT',
      asset: 'USDT',
      income: -0.12345678,
    });
    expect(rows[1].income).toBe(0.05);
  });

  it('returns an empty array (does not throw) when the Binance call fails', async () => {
    const getSigned = jest.fn().mockRejectedValue(new Error('network error'));
    const binance = { getSigned } as any;
    const service = new BinanceWalletHistoryService(binance);

    const rows = await service.fetchFundingFees(0, 1000);

    expect(rows).toEqual([]);
  });
});
