import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, scryptSync } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

async function cleanDatabase() {
  // Delete in dependency-safe order
  await prisma.tradingExecution.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.cryptoPrice.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.journalEntryLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.accountBalance.deleteMany();
  await prisma.tradingOrder.deleteMany();
  await prisma.session.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.tradingStrategy.deleteMany();
  await prisma.strategyType.deleteMany();
  await prisma.tradingPair.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.bankAccountType.deleteMany();
  await prisma.currency.deleteMany();
  await prisma.transactionStatus.deleteMany();
}

async function seedMasterData() {
  await prisma.transactionStatus.createMany({
    data: [
      { id: 1, statusName: 'FAILED' },
      { id: 2, statusName: 'PENDING' },
      { id: 3, statusName: 'CONFIRMED' },
      { id: 4, statusName: 'COMPLETED' },
      { id: 5, statusName: 'PROCESSING' },
    ],
    skipDuplicates: true,
  });

  await prisma.currency.createMany({
    data: [
      { code: 'USDT', description: 'Tether USD' },
      { code: 'BTC', description: 'Bitcoin' },
      { code: 'ETH', description: 'Ethereum' },
      { code: 'XRP', description: 'Ripple' },
      { code: 'FDUSD', description: 'First Digital USD' },
      { code: 'BNB', description: 'Binance Coin' },
      { code: 'SOL', description: 'Solana' },
    ],
    skipDuplicates: true,
  });

  const spotType = await prisma.bankAccountType.create({
    data: {
      typeName: 'Spot',
      description: 'Spot account',
    },
  });

 

  const profileA = await prisma.profile.create({
    data: {
      firstName: 'Enyelberth',
      lastName: 'Rodriguez',
      phone: '+584149732442',
      birthDate: new Date('2003-12-22'),
      address: 'Venezuela',
    },
  });



  const userA = await prisma.user.create({
    data: {
      email: 'enyelberthrc22.z@gmail.com',
      username: 'enyelberth10',
      password: hashPassword('30204334'),
      key: 'key_demo_enyel',
      secretKey: 'secret_demo_enyel',
      profileId: profileA.id,
    },
  });

  const profileB = await prisma.profile.create({
    data: {
      firstName: 'Operador',
      lastName: 'Secundario',
      phone: '+580000000000',
      birthDate: new Date('2000-01-01'),
      address: 'Venezuela',
    },
  });

  const userB = await prisma.user.create({
    data: {
      email: 'ops.enyelberthrc22.z@gmail.com',
      username: 'opsbot',
      password: hashPassword('Ops123!'),
      key: 'key_demo_ops',
      secretKey: 'secret_demo_ops',
      profileId: profileB.id,
    },
  });

 
  await prisma.session.createMany({
    data: [
      {
        userId: userA.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        userAgent: 'seed-script',
        ipAddress: '127.0.0.1',
      }
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: userA.id,
        title: 'Bienvenido',
        message: 'Tu cuenta fue creada exitosamente.',
        read: false,
      },
      {
        userId: userA.id,
        title: 'Bot activo',
        message: 'Se inicio una estrategia de prueba.',
        read: true,
      }
     
    ],
  });

  const accountA1 = await prisma.account.create({
    data: {
      userId: userA.id,
      bankAccountTypeId: spotType.id,
      key: 'acc_key_001',
      secretKey: 'acc_secret_001',
      email: 'spot.enyelberthrc22.z@gmail.com',
      password: hashPassword('Spot123!'),
    },
  });

  await prisma.account.create({
    data: {
      userId: userA.id,
      bankAccountTypeId: spotType.id,
      key: 'binance_sync_offset',
      secretKey: 'binance_sync_offset_secret',
      email: 'binance.sync.offset@local',
      password: hashPassword('BinanceSyncOffset123!'),
    },
  });




  const desiredBalances = [
    { accountId: accountA1.id, currencyCode: 'USDT', balance: '10000.00' },
    { accountId: accountA1.id, currencyCode: 'FDUSD', balance: '500.00' },
    { accountId: accountA1.id, currencyCode: 'BTC', balance: '0.12000000' }
  ];

  for (const row of desiredBalances) {
    await prisma.accountBalance.upsert({
      where: {
        accountId_currencyCode: {
          accountId: row.accountId,
          currencyCode: row.currencyCode,
        },
      },
      update: {
        balance: row.balance,
      },
      create: row,
    });
  }

  await prisma.tradingPair.createMany({
    data: [
      { baseCurrencyCode: 'BTC', quoteCurrencyCode: 'USDT' },
      { baseCurrencyCode: 'ETH', quoteCurrencyCode: 'USDT' },
      { baseCurrencyCode: 'XRP', quoteCurrencyCode: 'USDT' },
      { baseCurrencyCode: 'XRP', quoteCurrencyCode: 'FDUSD' },
    ],
    skipDuplicates: true,
  });

  const strategyTypeGrid = await prisma.strategyType.create({
    data: {
      name: 'grid',
      description: 'Grid strategy',
    },
  });

  const strategyTypeRsi = await prisma.strategyType.create({
    data: {
      name: 'rsi',
      description: 'RSI strategy',
    },
  });

  await prisma.tradingStrategy.createMany({
    data: [
      {
        id: 'strat-grid-btc-01',
        symbol: 'BTCUSDT',
        typeId: strategyTypeGrid.id,
        strategyType: 'gridBuy',
        config: {
          gridCount: 10,
          lowerPrice: 58000,
          upperPrice: 74000,
          totalQuantity: 0.1,
          profitMargin: 0.01,
        },
      },
      {
        id: 'strat-rsi-xrp-01',
        symbol: 'XRPUSDT',
        typeId: strategyTypeRsi.id,
        strategyType: 'rsi',
        config: {
          rsiPeriod: 14,
          oversoldThreshold: 30,
          overboughtThreshold: 70,
          tradeQuantity: 100,
        },
      },
    ],
  });

  const orderA = await prisma.tradingOrder.create({
    data: {
      accountId: accountA1.id,
      symbol: 'BTCUSDT',
      orderId: 900001,
      client_order_id: 'client-btc-900001',
      side: 'BUY',
      price: '62000.00',
      quantity: '0.05000000',
      quantityExecuted: '0.05000000',
      status: 'FILLED',
      type: 'LIMIT',
      isWorking: false,
      profit_loss: '120.50',
    },
  });


  await prisma.tradingExecution.createMany({
    data: [
      {
        orderId: orderA.id,
        tradePrice: '62000.00',
        tradeQuantity: '0.05000000',
      }
    ],
  });

  const entryA = await prisma.journalEntry.create({
    data: {
      entryDate: new Date(),
      description: 'BTC buy settlement',
      createdBy: 'seed-script',
      statusId: 4,
    },
  });

  await prisma.journalEntryLine.createMany({
    data: [
      {
        entryId: entryA.id,
        accountId: accountA1.id,
        currencyCode: 'BTC',
        amount: '0.05000000',
        entryType: 'DEBIT',
      },
      {
        entryId: entryA.id,
        accountId: accountA1.id,
        currencyCode: 'USDT',
        amount: '-3100.00',
        entryType: 'CREDIT',
      },
    ],
  });

  
  

  const now = new Date();
  await prisma.cryptoPrice.createMany({
    data: [
      { symbol: 'BTCUSDT', price: 63500.25, volume: 1234.88, timestamp: now },
      { symbol: 'ETHUSDT', price: 3180.45, volume: 4211.12, timestamp: now },
      { symbol: 'XRPUSDT', price: 0.622, volume: 999999, timestamp: now },
    ],
  });

  await prisma.alert.createMany({
    data: [
      {
        symbol: 'BTCUSDT',
        price: 65000,
        up_down: 'up',
        volume: 1200,
        timestamp: now,
      },
      {
        symbol: 'XRPUSDT',
        price: 0.58,
        up_down: 'down',
        volume: 900000,
        timestamp: now,
      },
    ],
  });
}

async function main() {
  console.log('Cleaning database...');
  await cleanDatabase();

  console.log('Seeding full data set...');
  await seedMasterData();

  console.log('Full seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Full seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
