import { Test, TestingModule } from '@nestjs/testing';
import { BinanceAccountService } from './binance-account.service';
import { BinanceAuthService } from './binance-auth.service';

describe('BinanceAccountService', () => {
  let service: BinanceAccountService;
  let mockAuthService: jest.Mocked<BinanceAuthService>;

  const mockAccountInfo = {
    balances: [
      { asset: 'USDT', free: '1000.00', locked: '500.00' },
      { asset: 'BTC', free: '0.5', locked: '0' },
      { asset: 'ETH', free: '0', locked: '0' },
    ],
  };

  const mockCrossMarginAccountInfo = {
    marginLevel: '5.5',
    totalAssetOfBtc: '10.5',
    totalLiabilityOfBtc: '2.0',
    totalNetAssetOfBtc: '8.5',
    quoteAsset: 'USDT',
    userAssets: [
      { asset: 'USDT', free: '2000', borrowed: '1000', netAsset: '1000', interest: '10' },
      { asset: 'BTC', free: '0.5', borrowed: '0.1', netAsset: '0.4', interest: '0.001' },
    ],
  };

  beforeEach(async () => {
    mockAuthService = {
      getSigned: jest.fn(),
      postSigned: jest.fn(),
      getServerTime: jest.fn(),
      canUseMargin: jest.fn().mockReturnValue(true),
      getBaseUrl: jest.fn().mockReturnValue('https://testnet.binance.vision'),
      getHttpsAgent: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BinanceAccountService,
        {
          provide: BinanceAuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    service = module.get<BinanceAccountService>(BinanceAccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAccountInfo', () => {
    it('should fetch account info from Binance', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockAccountInfo);

      const result = await service.getAccountInfo();

      expect(result).toEqual(mockAccountInfo);
      expect(mockAuthService.getSigned).toHaveBeenCalledWith(
        '/api/v3/account',
        expect.objectContaining({
          timestamp: 1712000000000,
          recvWindow: 10000,
        })
      );
    });
  });

  describe('getNonZeroBalances', () => {
    it('should filter out zero balances', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockAccountInfo);

      const result = await service.getNonZeroBalances();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ asset: 'USDT', free: '1000.00', locked: '500.00' });
      expect(result).toContainEqual({ asset: 'BTC', free: '0.5', locked: '0' });
      expect(result).not.toContainEqual({ asset: 'ETH', free: '0', locked: '0' });
    });

    it('should include locked balances in filter', async () => {
      const accountWithLocked = {
        balances: [
          { asset: 'USDT', free: '0', locked: '100' },
          { asset: 'BTC', free: '0', locked: '0' },
        ],
      };

      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(accountWithLocked);

      const result = await service.getNonZeroBalances();

      expect(result).toHaveLength(1);
      expect(result[0].asset).toBe('USDT');
    });
  });

  describe('getCrossMarginAccountInfo', () => {
    it('should fetch cross margin account info', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockCrossMarginAccountInfo);

      const result = await service.getCrossMarginAccountInfo();

      expect(result).toEqual(mockCrossMarginAccountInfo);
      expect(mockAuthService.getSigned).toHaveBeenCalledWith(
        '/sapi/v1/margin/account',
        expect.anything()
      );
    });

    it('should return error when margin not enabled', async () => {
      mockAuthService.canUseMargin.mockReturnValueOnce(false);
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockRejectedValueOnce(new Error('Margin not enabled'));

      await expect(service.getCrossMarginAccountInfo()).rejects.toThrow();
    });
  });

  describe('getCrossMarginPositions', () => {
    it('should fetch all cross margin positions', async () => {
      const mockPositions = [
        { symbol: 'BTCUSDT', positionAmt: '0.5', entryPrice: '40000', markPrice: '45000' },
        { symbol: 'ETHUSDT', positionAmt: '1.0', entryPrice: '2000', markPrice: '2500' },
      ];

      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockPositions);

      const result = await service.getCrossMarginPositions();

      expect(result).toEqual(mockPositions);
      expect(result).toHaveLength(2);
    });

    it('should throw error if response is not an array', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce({ error: 'invalid' });

      await expect(service.getCrossMarginPositions()).rejects.toThrow(
        'La respuesta no es un array de posiciones'
      );
    });
  });

  describe('getCrossMarginPosition', () => {
    it('should find position by symbol', async () => {
      const mockPositions = [
        { symbol: 'BTCUSDT', positionAmt: '0.5' },
        { symbol: 'ETHUSDT', positionAmt: '1.0' },
      ];

      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockPositions);

      const result = await service.getCrossMarginPosition('BTCUSDT');

      expect(result.symbol).toBe('BTCUSDT');
      expect(result.positionAmt).toBe('0.5');
    });

    it('should throw error if symbol position not found', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce([]);

      await expect(service.getCrossMarginPosition('XYZUSDT')).rejects.toThrow(
        'No hay posición abierta para el símbolo XYZUSDT'
      );
    });
  });

  describe('calculateCrossMarginSummary', () => {
    it('should calculate summary with healthy margin level', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockCrossMarginAccountInfo);

      const result = await service.calculateCrossMarginSummary();

      expect(result.marginLevel).toBe(5.5);
      expect(result.totalAsset).toBe(10.5);
      expect(result.totalLiability).toBe(2.0);
      expect(result.userAssets).toHaveLength(2);
    });
  });

  describe('getCrossMarginPNLSummary', () => {
    it('should return margin disabled status when canUseMargin is false', async () => {
      mockAuthService.canUseMargin.mockReturnValueOnce(false);

      const result = await service.getCrossMarginPNLSummary();

      expect(result.liquidationStatus).toContain('Margin desactivado');
      expect(result.riskLevel).toBe('BAJO');
      expect(result.marginLevel).toBe('999.00000000');
    });

    it('should assess BAJO risk level when margin level > 1.5', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce({
        ...mockCrossMarginAccountInfo,
        marginLevel: '5.5',
      });

      const result = await service.getCrossMarginPNLSummary();

      expect(result.riskLevel).toBe('BAJO');
      expect(result.liquidationStatus).toContain('saludable');
    });

    it('should assess MEDIO risk level when margin level between 1.1 and 1.5', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce({
        ...mockCrossMarginAccountInfo,
        marginLevel: '1.3',
      });

      const result = await service.getCrossMarginPNLSummary();

      expect(result.riskLevel).toBe('MEDIO');
    });

    it('should assess CRÍTICO risk level when margin level <= 1.0', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce({
        ...mockCrossMarginAccountInfo,
        marginLevel: '0.9',
      });

      const result = await service.getCrossMarginPNLSummary();

      expect(result.riskLevel).toBe('CRÍTICO');
      expect(result.liquidationStatus).toContain('PELIGRO DE LIQUIDACIÓN');
    });
  });

  describe('getConsolidatedBalance', () => {
    it('should consolidate balances from spot account', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockAccountInfo);

      const result = await service.getConsolidatedBalance();

      expect(result).toHaveProperty('byAsset');
      expect(result).toHaveProperty('summary');
      expect(result.byAsset).toHaveLength(2); // Only non-zero balances
    });

    it('should include margin balances when available', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockAccountInfo);
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockCrossMarginAccountInfo);

      const result = await service.getConsolidatedBalance();

      expect(result.byAsset.some((a: any) => a.margin > 0)).toBe(true);
    });
  });

  describe('getAvailableToTrade', () => {
    it('should calculate available trading capital', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockAccountInfo);
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockCrossMarginAccountInfo);

      const result = await service.getAvailableToTrade();

      expect(result).toHaveProperty('spot');
      expect(result).toHaveProperty('margin');
      expect(result).toHaveProperty('totalAvailable');
      expect(parseFloat(result.spot.available)).toBeGreaterThan(0);
    });

    it('should include recommendation when margin debt exists', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockAccountInfo);
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockCrossMarginAccountInfo);

      const result = await service.getAvailableToTrade();

      expect(result.recommendation).toContain('deudas');
    });
  });

  describe('getMarginUtilization', () => {
    it('should return disabled status when margin not enabled', async () => {
      mockAuthService.canUseMargin.mockReturnValueOnce(false);

      const result = await service.getMarginUtilization();

      expect(result.marginEnabled).toBe(false);
      expect(result.message).toContain('deshabilitado');
    });

    it('should calculate utilization ratio correctly', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce({
        ...mockCrossMarginAccountInfo,
        marginLevel: '3.5',
      });

      const result = await service.getMarginUtilization();

      expect(result.marginEnabled).toBe(true);
      expect(result.riskLevel).toBe('BAJO');
      expect(result.alerts.isHealthy).toBe(true);
    });
  });

  describe('transferBetweenSpotAndCrossMargin', () => {
    it('should transfer from spot to margin', async () => {
      const mockResponse = { tranId: 123456 };

      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.postSigned.mockResolvedValueOnce(mockResponse);

      const result = await service.transferBetweenSpotAndCrossMargin('USDT', '100', 1);

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.postSigned).toHaveBeenCalledWith(
        '/sapi/v1/margin/transfer',
        expect.objectContaining({
          asset: 'USDT',
          amount: '100',
          type: 1,
        })
      );
    });
  });
});
