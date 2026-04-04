import { JournalEntryService } from './journalEntry.service';

describe('JournalEntryService', () => {
  it('reabre un período contable cerrado', async () => {
    const update = jest.fn().mockResolvedValue({ id: 1, status: 'OPEN' });
    const prisma = {
      accountingPeriod: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, status: 'CLOSED' }),
        update,
      },
    } as any;

    const service = new JournalEntryService(prisma, {} as any, { incrementCounter: jest.fn(), setGauge: jest.fn() } as any);
    const result = await service.reopenAccountingPeriod(1, 'ADMIN');

    expect(result.status).toBe('OPEN');
    expect(update).toHaveBeenCalled();
  });
});
