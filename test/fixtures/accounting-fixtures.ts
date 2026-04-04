import { PrismaClient, Prisma } from '@prisma/client';
import { createBaseFixtures } from './base-fixtures';

export async function createAccountingFixture(prisma: PrismaClient, seed = 'accounting') {
  const base = await createBaseFixtures(prisma, { fixtureTag: seed });

  const entry = await prisma.journalEntry.create({
    data: {
      entryDate: new Date(),
      description: `fixture-entry-${seed}`,
      createdBy: seed,
      statusId: base.statusId,
      lines: {
        create: [
          {
            accountId: base.accountId,
            currencyCode: 'USDT',
            amount: new Prisma.Decimal(100),
            entryType: 'INGRESO',
          },
          {
            accountId: base.offsetAccountId,
            currencyCode: 'USDT',
            amount: new Prisma.Decimal(100),
            entryType: 'EGRESO',
          },
        ],
      },
    } as any,
    include: { lines: true },
  });

  return { ...base, entryId: entry.id };
}
