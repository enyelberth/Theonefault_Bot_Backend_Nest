import { CapitalLedgerService } from './capital-ledger.service';
import { Prisma } from '@prisma/client';

describe('CapitalLedgerService.dailyTotals', () => {
  it('accumulates many small amounts without binary floating point drift', async () => {
    const day = new Date('2026-01-01T00:00:00.000Z');
    const events = Array.from({ length: 1000 }, () => ({
      amount: new Prisma.Decimal('0.00000001'),
      currency: 'USDT',
      occurredAt: day,
    }));
    const prisma = {
      capitalEvent: {
        findMany: jest.fn().mockResolvedValue(events),
      },
    } as any;
    const service = new CapitalLedgerService(prisma);

    const result = await service.dailyTotals({});

    expect(result).toHaveLength(1);
    // 1000 * 0.00000001 = 0.00000001 * 1000 = 0.00001 exactly
    expect(result[0].total).toBe(0.00001);
    expect(result[0].gains).toBe(0.00001);
    expect(result[0].losses).toBe(0);
    expect(result[0].count).toBe(1000);
  });

  it('separates gains and losses per day/currency bucket', async () => {
    const day = new Date('2026-02-01T00:00:00.000Z');
    const events = [
      { amount: new Prisma.Decimal('10'), currency: 'USDT', occurredAt: day },
      { amount: new Prisma.Decimal('-4'), currency: 'USDT', occurredAt: day },
    ];
    const prisma = {
      capitalEvent: { findMany: jest.fn().mockResolvedValue(events) },
    } as any;
    const service = new CapitalLedgerService(prisma);

    const [bucket] = await service.dailyTotals({});

    expect(bucket.total).toBe(6);
    expect(bucket.gains).toBe(10);
    expect(bucket.losses).toBe(-4);
  });
});
