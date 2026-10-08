import { TradingService } from './trading.service';
import { OrderSide, OrderStatus, OrderType, Prisma } from '@prisma/client';

describe('TradingService.updateTradingOrderStatus', () => {
  function buildService(order: any) {
    const prisma = {
      tradingOrder: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...order, ...data }),
          ),
      },
    } as any;
    return new TradingService(prisma);
  }

  it('computes PnL using Decimal arithmetic without float rounding error', async () => {
    const order = {
      id: 1,
      side: OrderSide.BUY,
      type: OrderType.LIMIT,
      status: OrderStatus.OPEN,
      quantity: new Prisma.Decimal('0.3'),
      price: new Prisma.Decimal('0.1'),
    };
    const service = buildService(order);

    const updated = await service.updateTradingOrderStatus(
      1,
      OrderStatus.FILLED,
      0.3,
    );

    // (0.3 - 0.1) * 0.3 = 0.06 exactly in Decimal; float arithmetic gives 0.060000000000000005
    expect(updated.profit_loss).toBeInstanceOf(Prisma.Decimal);
    expect((updated.profit_loss as Prisma.Decimal).toString()).toBe('0.06');
  });

  it('computes negative PnL for SELL side correctly', async () => {
    const order = {
      id: 2,
      side: OrderSide.SELL,
      type: OrderType.LIMIT,
      status: OrderStatus.OPEN,
      quantity: new Prisma.Decimal('2'),
      price: new Prisma.Decimal('100'),
    };
    const service = buildService(order);

    const updated = await service.updateTradingOrderStatus(
      2,
      OrderStatus.FILLED,
      110,
    );

    // SELL: (referencePrice - execPrice) * qty = (100 - 110) * 2 = -20
    expect((updated.profit_loss as Prisma.Decimal).toString()).toBe('-20');
  });
});
