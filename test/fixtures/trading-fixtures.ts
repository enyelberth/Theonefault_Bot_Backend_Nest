import { PrismaClient } from '@prisma/client';
import { createBaseFixtures, createTradingOrderFixture } from './base-fixtures';

export async function createTradingFixture(
  prisma: PrismaClient,
  seed = 'trading',
) {
  const base = await createBaseFixtures(prisma, { fixtureTag: seed });
  const orderId = await createTradingOrderFixture(prisma, {
    accountId: base.accountId,
    strategyTypeId: base.strategyTypeId,
    profitLoss: 12.5,
    status: 'CLOSED',
  });

  return { ...base, orderId };
}
