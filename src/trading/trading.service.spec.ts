import { BadRequestException } from '@nestjs/common';
import { TradingService } from './trading.service';

describe('TradingService', () => {
  it('rechaza simulación fuera de horario permitido', async () => {
    const prisma = {
      tradingOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const service = new TradingService(prisma);
    const currentHour = new Date().getUTCHours();
    const blockedHour = currentHour === 23 ? 22 : currentHour + 1;

    const result = await service.simulateTradingOrder({
      accountId: 1,
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 1,
      allowedFromHourUtc: blockedHour,
      allowedToHourUtc: blockedHour,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('TRADING_WINDOW_CLOSED');
  });

  it('rechaza creación si reglas de riesgo fallan', async () => {
    const prisma = {
      tradingOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    } as any;

    const service = new TradingService(prisma);
    const currentHour = new Date().getUTCHours();
    const blockedHour = currentHour === 23 ? 22 : currentHour + 1;

    await expect(service.createTradingOrder({
      accountId: 1,
      symbol: 'BTCUSDT',
      orderId: 1,
      client_order_id: 'abc',
      side: 'BUY',
      quantity: 1,
      quantityExecuted: 0,
      type: 'MARKET',
      allowedFromHourUtc: blockedHour,
      allowedToHourUtc: blockedHour,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});
