import { Test, TestingModule } from '@nestjs/testing';
import { BinanceSpotService } from './binance-spot.service';
import { BinanceAuthService } from './binance-auth.service';
import { StrategyOpsService } from 'src/strategy-monitoring/strategy-ops.service';

describe('BinanceSpotService', () => {
  let service: BinanceSpotService;
  let mockAuthService: jest.Mocked<BinanceAuthService>;
  let mockStrategyOps: jest.Mocked<StrategyOpsService>;

  beforeEach(async () => {
    mockAuthService = {
      getContext: jest.fn().mockReturnValue(null),
      getServerTime: jest.fn(),
      postSigned: jest.fn(),
      getSigned: jest.fn(),
      getBaseUrl: jest.fn().mockReturnValue('https://testnet.binance.vision'),
      getApiKey: jest.fn().mockReturnValue('test-api-key'),
      getHttpsAgent: jest.fn(),
    } as any;

    mockStrategyOps = {
      assertRisk: jest.fn(),
      buildClientOrderId: jest.fn(),
      recordOrderPlacement: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BinanceSpotService,
        {
          provide: BinanceAuthService,
          useValue: mockAuthService,
        },
        {
          provide: StrategyOpsService,
          useValue: mockStrategyOps,
        },
      ],
    }).compile();

    service = module.get<BinanceSpotService>(BinanceSpotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createLimitOrder', () => {
    it('should create a limit order without strategy context', async () => {
      const mockResponse = {
        orderId: 12345,
        symbol: 'BTCUSDT',
        status: 'NEW',
      };

      mockAuthService.postSigned.mockResolvedValueOnce(mockResponse);

      const result = await service.createLimitOrder(
        'BTCUSDT',
        'BUY',
        '0.1',
        '45000',
      );

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.postSigned).toHaveBeenCalledWith(
        '/api/v3/order',
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: 'BUY',
          type: 'LIMIT',
          quantity: '0.1',
          price: '45000',
          timeInForce: 'GTC',
        }),
      );
    });

    it('should create a limit order with strategy context', async () => {
      const context = {
        strategyId: 'test-strategy',
        strategyType: 'GRID_TRADING',
      };

      mockAuthService.getContext.mockReturnValueOnce(context);
      mockStrategyOps.buildClientOrderId.mockReturnValueOnce('test-order-id');
      mockAuthService.postSigned.mockResolvedValueOnce({ orderId: 12345 });

      await service.createLimitOrder('BTCUSDT', 'BUY', '0.1', '45000');

      expect(mockStrategyOps.assertRisk).toHaveBeenCalledWith(
        context,
        'BUY',
        0.1,
        45000,
      );
      expect(mockStrategyOps.buildClientOrderId).toHaveBeenCalledWith(
        context,
        'BUY',
        'spot',
      );
      expect(mockStrategyOps.recordOrderPlacement).toHaveBeenCalled();
    });

    it('should use custom timeInForce', async () => {
      mockAuthService.postSigned.mockResolvedValueOnce({ orderId: 12345 });

      await service.createLimitOrder('BTCUSDT', 'BUY', '0.1', '45000', 'IOC');

      expect(mockAuthService.postSigned).toHaveBeenCalledWith(
        '/api/v3/order',
        expect.objectContaining({
          timeInForce: 'IOC',
        }),
      );
    });
  });

  describe('createMarketOrder', () => {
    it('should create a market order', async () => {
      const mockResponse = {
        orderId: 12345,
        symbol: 'BTCUSDT',
        status: 'FILLED',
      };

      mockAuthService.postSigned.mockResolvedValueOnce(mockResponse);

      const result = await service.createMarketOrder('BTCUSDT', 'SELL', '0.1');

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.postSigned).toHaveBeenCalledWith(
        '/api/v3/order',
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: 'SELL',
          type: 'MARKET',
          quantity: '0.1',
        }),
      );
    });
  });

  describe('checkOrderStatus', () => {
    it('should check order status by symbol and orderId', async () => {
      const mockResponse = {
        symbol: 'BTCUSDT',
        orderId: 12345,
        status: 'FILLED',
      };

      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockResponse);

      const result = await service.checkOrderStatus('BTCUSDT', 12345);

      expect(result).toEqual(mockResponse);
      expect(mockAuthService.getSigned).toHaveBeenCalledWith(
        '/api/v3/order',
        expect.objectContaining({
          symbol: 'BTCUSDT',
          orderId: 12345,
        }),
      );
    });
  });

  describe('getAllOrders', () => {
    it('should fetch all orders for a symbol', async () => {
      const mockOrders = [
        { orderId: 1, symbol: 'BTCUSDT', status: 'FILLED' },
        { orderId: 2, symbol: 'BTCUSDT', status: 'CANCELED' },
      ];

      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce(mockOrders);

      const result = await service.getAllOrders('BTCUSDT', 500);

      expect(result).toEqual(mockOrders);
      expect(mockAuthService.getSigned).toHaveBeenCalledWith(
        '/api/v3/allOrders',
        expect.objectContaining({
          symbol: 'BTCUSDT',
          limit: 500,
        }),
      );
    });

    it('should support pagination with fromId', async () => {
      mockAuthService.getServerTime.mockResolvedValueOnce(1712000000000);
      mockAuthService.getSigned.mockResolvedValueOnce([]);

      await service.getAllOrders('BTCUSDT', 100, 5000);

      expect(mockAuthService.getSigned).toHaveBeenCalledWith(
        '/api/v3/allOrders',
        expect.objectContaining({
          symbol: 'BTCUSDT',
          limit: 100,
          fromId: 5000,
        }),
      );
    });
  });

  describe('getSymbolPrice', () => {
    it('should fetch current price for symbol', async () => {
      const mockPrice = { symbol: 'BTCUSDT', price: '45000.50' };

      mockAuthService.getSigned.mockResolvedValueOnce(mockPrice);

      const result = await service.getSymbolPrice('BTCUSDT');

      expect(result).toEqual(mockPrice);
    });
  });

  describe('obtenerFiltrosSimbolo', () => {
    it('should fetch price and lot size filters for symbol', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            filters: [
              { filterType: 'PRICE_FILTER', tickSize: '0.01' },
              { filterType: 'LOT_SIZE', stepSize: '0.00001' },
            ],
          },
        ],
      };

      mockAuthService.getSigned.mockResolvedValueOnce(mockExchangeInfo);

      const result = await service.obtenerFiltrosSimbolo('BTCUSDT');

      expect(result).toHaveProperty('priceFilter');
      expect(result).toHaveProperty('lotSizeFilter');
      expect(result.priceFilter.tickSize).toBe('0.01');
      expect(result.lotSizeFilter.stepSize).toBe('0.00001');
    });

    it('should throw error when symbol not found', async () => {
      const mockExchangeInfo = { symbols: [] };

      mockAuthService.getSigned.mockResolvedValueOnce(mockExchangeInfo);

      await expect(service.obtenerFiltrosSimbolo('XYZUSDT')).rejects.toThrow(
        'Símbolo XYZUSDT no encontrado',
      );
    });
  });

  describe('getDecimalsForSymbol', () => {
    it('should calculate price and quantity decimals', async () => {
      const mockExchangeInfo = {
        symbols: [
          {
            symbol: 'BTCUSDT',
            filters: [
              { filterType: 'PRICE_FILTER', tickSize: '0.01' },
              { filterType: 'LOT_SIZE', stepSize: '0.00001' },
            ],
          },
        ],
      };

      mockAuthService.getSigned.mockResolvedValueOnce(mockExchangeInfo);

      const result = await service.getDecimalsForSymbol('BTCUSDT');

      expect(result.priceDecimals).toBe(2);
      expect(result.quantityDecimals).toBe(5);
    });
  });

  describe('floorToStep (private helper)', () => {
    it('should floor quantity to step size', async () => {
      // Access the function through the getter
      const floorToStep = service.getFloorToStep();

      expect(floorToStep(0.12345, 0.00001)).toBe(0.12345);
      expect(floorToStep(0.123456, 0.00001)).toBe(0.12345);
      expect(floorToStep(1.5, 0.5)).toBe(1.5);
    });

    it('should return 0 for invalid inputs', async () => {
      const floorToStep = service.getFloorToStep();

      expect(floorToStep(-0.5, 0.00001)).toBe(0);
      expect(floorToStep(0.00001, 0)).toBe(0.00001); // Invalid stepSize returns original
    });
  });

  describe('extractBaseAsset (private helper)', () => {
    it('should extract base asset from symbol', () => {
      const extractBaseAsset = service.getExtractBaseAsset();

      expect(extractBaseAsset('BTCUSDT')).toBe('BTC');
      expect(extractBaseAsset('ETHUSDT')).toBe('ETH');
      expect(extractBaseAsset('BNBBUSD')).toBe('BNB');
      expect(extractBaseAsset('BTCUSDC')).toBe('BTC');
    });

    it('should handle symbols with less common quote assets', () => {
      const extractBaseAsset = service.getExtractBaseAsset();

      expect(extractBaseAsset('BTCBNB')).toBe('BTC');
      expect(extractBaseAsset('ETHBTC')).toBe('ETH');
    });
  });
});
