import { Prisma, PrismaClient } from '@prisma/client';

export interface BaseFixturesResult {
  fixtureTag: string;
  userId: number;
  accountId: number;
  offsetAccountId: number;
  bankAccountTypeId: number;
  statusId: number;
  strategyTypeId: number;
  currencies: string[];
}

export interface BaseFixturesOptions {
  fixtureTag?: string;
  baseCurrency?: string;
  quoteCurrency?: string;
}

function randomTag(): string {
  const ts = Date.now();
  const rnd = Math.floor(Math.random() * 1000000);
  return `fixture-${ts}-${rnd}`;
}

export async function createBaseFixtures(
  prisma: PrismaClient,
  options: BaseFixturesOptions = {},
): Promise<BaseFixturesResult> {
  const fixtureTag = options.fixtureTag ?? randomTag();
  const baseCurrency = (options.baseCurrency ?? 'BTC').toUpperCase();
  const quoteCurrency = (options.quoteCurrency ?? 'USDT').toUpperCase();

  const user = await prisma.user.create({
    data: {
      email: `${fixtureTag}@test.local`,
      username: fixtureTag,
      password: 'fixture-password-not-for-prod',
      role: 'ADMIN',
    } as any,
  });

  const bankType = await prisma.bankAccountType.create({
    data: {
      typeName: `SPOT-${fixtureTag}`,
      description: 'Fixture account type for isolated tests',
    },
  });

  await prisma.currency.createMany({
    data: [
      { code: baseCurrency, description: `${baseCurrency} fixture currency` },
      { code: quoteCurrency, description: `${quoteCurrency} fixture currency` },
    ],
    skipDuplicates: true,
  });

  const status = await prisma.transactionStatus.create({
    data: {
      statusName: `OPEN-${fixtureTag}`,
    },
  });

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      bankAccountTypeId: bankType.id,
      key: `key-${fixtureTag}`,
      secretKey: `secret-${fixtureTag}`,
      email: `account-${fixtureTag}@test.local`,
      password: 'fixture-password-not-for-prod',
    },
  });

  const offsetAccount = await prisma.account.create({
    data: {
      userId: user.id,
      bankAccountTypeId: bankType.id,
      key: 'binance_sync_offset',
      secretKey: `offset-secret-${fixtureTag}`,
      email: `binance.sync.offset.${fixtureTag}@test.local`,
      password: 'fixture-password-not-for-prod',
    },
  });

  await prisma.accountBalance.createMany({
    data: [
      {
        accountId: account.id,
        currencyCode: quoteCurrency,
        balance: new Prisma.Decimal(0),
      },
      {
        accountId: offsetAccount.id,
        currencyCode: quoteCurrency,
        balance: new Prisma.Decimal(0),
      },
    ],
    skipDuplicates: true,
  });

  const strategyType = await prisma.strategyType.upsert({
    where: { name: `fixture-strategy-${fixtureTag}` },
    update: {},
    create: {
      name: `fixture-strategy-${fixtureTag}`,
      description: 'Strategy type for fixture tests',
    },
  });

  return {
    fixtureTag,
    userId: user.id,
    accountId: account.id,
    offsetAccountId: offsetAccount.id,
    bankAccountTypeId: bankType.id,
    statusId: status.id,
    strategyTypeId: strategyType.id,
    currencies: [baseCurrency, quoteCurrency],
  };
}

export async function cleanupBaseFixtures(
  prisma: PrismaClient,
  fixtureTag: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: `${fixtureTag}@test.local` },
    select: { id: true },
  });

  if (!user) {
    return;
  }

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { id: true },
  });

  const accountIds = accounts.map((account) => account.id);

  await prisma.$transaction(async (tx) => {
    const txAny = tx as any;
    if (accountIds.length > 0) {
      await tx.tradingExecution.deleteMany({
        where: {
          tradingOrder: {
            accountId: { in: accountIds },
          },
        },
      });

      await tx.tradingOrder.deleteMany({
        where: {
          accountId: { in: accountIds },
        },
      });

      await txAny.binanceSyncLog.deleteMany({
        where: {
          OR: [
            { accountId: { in: accountIds } },
            { offsetAccountId: { in: accountIds } },
          ],
        },
      });

      await txAny.dailyPnlSnapshot.deleteMany({
        where: {
          accountId: { in: accountIds },
        },
      });

      await tx.accountBalance.deleteMany({
        where: {
          accountId: { in: accountIds },
        },
      });

      await tx.journalEntryLine.deleteMany({
        where: {
          accountId: { in: accountIds },
        },
      });
    }

    await tx.journalEntry.deleteMany({
      where: {
        OR: [
          { createdBy: fixtureTag },
          { description: { contains: fixtureTag } },
        ],
      },
    });

    await tx.notification.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });

    if (accountIds.length > 0) {
      await tx.account.deleteMany({ where: { id: { in: accountIds } } });
    }

    await tx.transactionStatus.deleteMany({
      where: { statusName: `OPEN-${fixtureTag}` },
    });
    await tx.bankAccountType.deleteMany({
      where: { typeName: `SPOT-${fixtureTag}` },
    });
    await tx.strategyType.deleteMany({
      where: { name: `fixture-strategy-${fixtureTag}` },
    });
    await tx.user.delete({ where: { id: user.id } });
  });
}

export async function createTradingOrderFixture(
  prisma: PrismaClient,
  params: {
    accountId: number;
    symbol?: string;
    strategyTypeId?: number;
    profitLoss?: number | string;
    status?: 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'CLOSED';
  },
): Promise<number> {
  const symbol = (params.symbol ?? 'BTCUSDT').toUpperCase();
  const now = Date.now();

  const order = await prisma.tradingOrder.create({
    data: {
      accountId: params.accountId,
      symbol,
      orderId: now,
      client_order_id: `fixture-order-${now}`,
      side: 'BUY',
      quantity: new Prisma.Decimal(0.1),
      quantityExecuted: new Prisma.Decimal(0.1),
      status: params.status ?? 'CLOSED',
      type: 'MARKET',
      profit_loss:
        params.profitLoss !== undefined
          ? new Prisma.Decimal(params.profitLoss)
          : new Prisma.Decimal(10),
      closed_time: new Date(),
    },
  });

  if (params.strategyTypeId) {
    await prisma.tradingStrategy.create({
      data: {
        id: `fixture-strategy-${order.id}`,
        symbol,
        typeId: params.strategyTypeId,
        strategyType: 'fixture',
        config: { source: 'fixture' },
      },
    });
  }

  return order.id;
}
