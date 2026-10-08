import { Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { JournalEntryService } from './journalEntry.service';
import {
  CreateJournalEntryDto,
  EntryType,
} from './dto/create-journalEntry.dto';

describe('JournalEntryService', () => {
  const queryRaw = jest.fn();
  const findUnique = jest.fn();
  const transaction = jest.fn();
  const txAccountBalanceFindUnique = jest.fn();
  const txAccountBalanceUpdate = jest.fn();
  const txAccountBalanceCreate = jest.fn();

  const tx = {
    accountBalance: {
      findUnique: txAccountBalanceFindUnique,
      update: txAccountBalanceUpdate,
      create: txAccountBalanceCreate,
    },
  };

  const prisma = {
    $queryRaw: queryRaw,
    $transaction: transaction,
    journalEntry: { findUnique },
  };

  const service = new JournalEntryService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation((cb: any) => cb(tx));
    txAccountBalanceFindUnique.mockResolvedValue(null);
  });

  const baseDto = (
    lines: {
      accountId: number;
      currencyCode: string;
      amount: string;
      entryType: EntryType;
    }[],
  ): CreateJournalEntryDto =>
    ({
      entryDate: '2026-01-01T00:00:00Z',
      description: 'test',
      createdBy: 'tester',
      lines,
    }) as CreateJournalEntryDto;

  describe('create', () => {
    it('crea la entrada cuando ingresos y egresos cuadran', async () => {
      const dto = baseDto([
        {
          accountId: 1,
          currencyCode: 'USDT',
          amount: '100',
          entryType: EntryType.INGRESO,
        },
        {
          accountId: 2,
          currencyCode: 'USDT',
          amount: '100',
          entryType: EntryType.EGRESO,
        },
      ]);

      queryRaw.mockResolvedValueOnce([
        { insertar_journal_entry_con_lineas: 55 },
      ]);
      queryRaw.mockResolvedValueOnce(undefined); // insert de la segunda línea

      findUnique.mockResolvedValue({
        id: 55,
        lines: [
          {
            accountId: 1,
            currencyCode: 'USDT',
            amount: new Prisma.Decimal('100'),
            entryType: 'INGRESO',
          },
          {
            accountId: 2,
            currencyCode: 'USDT',
            amount: new Prisma.Decimal('100'),
            entryType: 'EGRESO',
          },
        ],
      });

      const result = await service.create(dto);

      expect(result).toMatchObject({ id: 55 });
      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('rechaza un asiento descuadrado sin tocar la base de datos', async () => {
      const dto = baseDto([
        {
          accountId: 1,
          currencyCode: 'USDT',
          amount: '100',
          entryType: EntryType.INGRESO,
        },
        {
          accountId: 2,
          currencyCode: 'USDT',
          amount: '40',
          entryType: EntryType.EGRESO,
        },
      ]);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);

      expect(queryRaw).not.toHaveBeenCalled();
      expect(findUnique).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rechaza un asiento vacío', async () => {
      const dto = baseDto([]);
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('updateBalances (precisión decimal)', () => {
    it('acumula montos fraccionarios sin error de redondeo float', async () => {
      txAccountBalanceFindUnique.mockResolvedValue({
        accountId: 1,
        currencyCode: 'USDT',
        balance: new Prisma.Decimal('0.1'),
      });

      await (service as any).updateBalances(tx, [
        {
          accountId: 1,
          currencyCode: 'USDT',
          amount: new Prisma.Decimal('0.2'),
          entryType: 'INGRESO',
        },
      ]);

      expect(txAccountBalanceUpdate).toHaveBeenCalledWith({
        where: {
          accountId_currencyCode: { accountId: 1, currencyCode: 'USDT' },
        },
        data: { balance: expect.any(Prisma.Decimal) },
      });
      const updatedBalance: Prisma.Decimal =
        txAccountBalanceUpdate.mock.calls[0][0].data.balance;
      expect(updatedBalance.toString()).toBe('0.3');
    });

    it('resta correctamente un EGRESO usando .negated() en vez de coaccionar a float', async () => {
      txAccountBalanceFindUnique.mockResolvedValue({
        accountId: 1,
        currencyCode: 'USDT',
        balance: new Prisma.Decimal('1'),
      });

      await (service as any).updateBalances(tx, [
        {
          accountId: 1,
          currencyCode: 'USDT',
          amount: new Prisma.Decimal('0.3'),
          entryType: 'EGRESO',
        },
      ]);

      const updatedBalance: Prisma.Decimal =
        txAccountBalanceUpdate.mock.calls[0][0].data.balance;
      expect(updatedBalance.toString()).toBe('0.7');
    });

    it('crea el balance cuando no existe uno previo', async () => {
      txAccountBalanceFindUnique.mockResolvedValue(null);

      await (service as any).updateBalances(tx, [
        {
          accountId: 9,
          currencyCode: 'BTC',
          amount: new Prisma.Decimal('0.00000001'),
          entryType: 'EGRESO',
        },
      ]);

      expect(txAccountBalanceCreate).toHaveBeenCalledTimes(1);
      const created = txAccountBalanceCreate.mock.calls[0][0].data
        .balance as Prisma.Decimal;
      expect(created.equals(new Prisma.Decimal('-0.00000001'))).toBe(true);
    });
  });
});
