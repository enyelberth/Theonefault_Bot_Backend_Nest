import { PrismaClient } from '@prisma/client';
import { createAccountingFixture } from './accounting-fixtures';
import { createTradingOrderFixture } from './base-fixtures';

export async function createAnalyticsFixture(prisma: PrismaClient, seed = 'analytics') {
  const accounting = await createAccountingFixture(prisma, seed);
  await createTradingOrderFixture(prisma, {
    accountId: accounting.accountId,
    strategyTypeId: accounting.strategyTypeId,
    profitLoss: 25,
    status: 'CLOSED',
  });
  await createTradingOrderFixture(prisma, {
    accountId: accounting.accountId,
    strategyTypeId: accounting.strategyTypeId,
    profitLoss: -7.5,
    status: 'CLOSED',
  });

  return accounting;
}
