import { Test, TestingModule } from '@nestjs/testing';
import { BinanceAuthService } from './binance-auth.service';
import { StrategyRuntimeContextService } from 'src/strategy-monitoring/strategy-runtime-context.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BinanceAuthService', () => {
  let service: BinanceAuthService;
  let mockStrategyContext: jest.Mocked<StrategyRuntimeContextService>;

  beforeEach(async () => {
    process.env.BINANCE_API_KEY = 'test-api-key';
    process.env.BINANCE_API_SECRET = 'test-api-secret';
    process.env.NODE_ENV = 'development';
    process.env.BASE_URL = 'https://testnet.binance.vision';
    process.env.ENABLE_MARGIN_IN_DEV = 'false';

    mockStrategyContext = {
      getContext: jest.fn().mockReturnValue({
        strategyId: 'test-strategy',
        strategyType: 'GRID_TRADING',
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BinanceAuthService,
        {
          provide: StrategyRuntimeContextService,
          useValue: mockStrategyContext,
        },
      ],
    }).compile();

    service = module.get<BinanceAuthService>(BinanceAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sign', () => {
    it('should generate valid HMAC SHA256 signature', () => {
      const querystring = 'symbol=BTCUSDT&side=BUY&quantity=1';
      const signature = service.sign(querystring);

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex is 64 chars
    });

    it('should generate consistent signature for same input', () => {
      const querystring = 'symbol=BTCUSDT&side=BUY&quantity=1';
      const sig1 = service.sign(querystring);
      const sig2 = service.sign(querystring);

      expect(sig1).toBe(sig2);
    });

    it('should generate different signatures for different inputs', () => {
      const sig1 = service.sign('symbol=BTCUSDT');
      const sig2 = service.sign('symbol=ETHUSDT');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('canUseMargin', () => {
    it('should return false in development without ENABLE_MARGIN_IN_DEV', () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_MARGIN_IN_DEV = 'false';

      expect(service.canUseMargin()).toBe(false);
    });

    it('should return true in development with ENABLE_MARGIN_IN_DEV=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.ENABLE_MARGIN_IN_DEV = 'true';

      const newService = new BinanceAuthService(mockStrategyContext);
      expect(newService.canUseMargin()).toBe(true);
    });

    it('should return true in production regardless of ENABLE_MARGIN_IN_DEV', () => {
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_MARGIN_IN_DEV = 'false';

      const newService = new BinanceAuthService(mockStrategyContext);
      expect(newService.canUseMargin()).toBe(true);
    });
  });

  describe('getServerTime', () => {
    it('should return server timestamp from Binance', async () => {
      const mockTime = 1712000000000;
      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: mockTime },
      });

      const result = await service.getServerTime();

      expect(result).toBe(mockTime);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${process.env.BASE_URL}/api/v3/time`,
        expect.objectContaining({ httpsAgent: expect.anything() }),
      );
    });

    it('should cache timeOffset after first call', async () => {
      const mockTime = 1712000000000;
      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: mockTime },
      });

      await service.getServerTime();
      await service.getServerTime();

      // Should only call axios once due to caching
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should throw error on network failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.getServerTime()).rejects.toThrow('Network error');
    });
  });

  describe('postSigned', () => {
    it('should POST with signature and API key', async () => {
      const endpoint = '/api/v3/order';
      const params = { symbol: 'BTCUSDT', side: 'BUY', quantity: '1' };
      const mockResponse = { orderId: 12345 };

      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: 1712000000000 },
      });
      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await service.postSigned(endpoint, params);

      expect(result).toEqual(mockResponse);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining(endpoint),
        null,
        expect.objectContaining({
          headers: { 'X-MBX-APIKEY': 'test-api-key' },
        }),
      );
    });

    it('should include timestamp and recvWindow in request', async () => {
      const mockTime = 1712000000000;
      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: mockTime },
      });
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await service.postSigned('/api/v3/order', { symbol: 'BTCUSDT' });

      const callUrl = mockedAxios.post.mock.calls[0][0];
      expect(callUrl).toContain('timestamp=' + mockTime);
      expect(callUrl).toContain('recvWindow=30000');
    });

    it('should include signature in URL', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: 1712000000000 },
      });
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await service.postSigned('/api/v3/order', { symbol: 'BTCUSDT' });

      const callUrl = mockedAxios.post.mock.calls[0][0];
      expect(callUrl).toContain('signature=');
    });
  });

  describe('getSigned', () => {
    it('should GET with signature and API key', async () => {
      const endpoint = '/api/v3/account';
      const params = { timestamp: 1712000000000 };
      const mockResponse = { balances: [] };

      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: 1712000000000 },
      });
      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const result = await service.getSigned(endpoint, params);

      expect(result).toEqual(mockResponse);
      expect(mockedAxios.get).toHaveBeenLastCalledWith(
        expect.stringContaining(endpoint),
        expect.objectContaining({
          headers: { 'X-MBX-APIKEY': 'test-api-key' },
        }),
      );
    });

    it('should use recvWindow of 10000 for GET requests', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { serverTime: 1712000000000 },
      });
      mockedAxios.get.mockResolvedValueOnce({ data: {} });

      await service.getSigned('/api/v3/account', {});

      const callUrl = mockedAxios.get.mock.calls[1][0]; // Second call
      expect(callUrl).toContain('recvWindow=10000');
    });
  });

  describe('getContext', () => {
    it('should return runtime context', () => {
      const context = service.getContext();

      expect(context).toEqual({
        strategyId: 'test-strategy',
        strategyType: 'GRID_TRADING',
      });
    });
  });

  describe('firmar', () => {
    it('should be a stub method for compatibility', () => {
      expect(() => service.firmar()).not.toThrow();
    });
  });

  describe('helper methods', () => {
    it('getApiKey should return configured API key', () => {
      expect(service.getApiKey()).toBe('test-api-key');
    });

    it('getBaseUrl should return configured base URL', () => {
      expect(service.getBaseUrl()).toBe('https://testnet.binance.vision');
    });

    it('getHttpsAgent should return https agent', () => {
      const agent = service.getHttpsAgent();
      expect(agent).toBeDefined();
    });
  });
});
