import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCurrencies() {
  const currencies = [
    { code: 'BTC', description: 'Bitcoin' },
    { code: 'ETH', description: 'Ethereum' },
    { code: 'USDT', description: 'Tether' },
    { code: 'BNB', description: 'Binance Coin' },
    { code: 'XRP', description: 'Ripple' },
    { code: 'USDC', description: 'USD Coin' },
    { code: 'SOL', description: 'Solana' },
    { code: 'ADA', description: 'Cardano' },
    { code: 'DOGE', description: 'Dogecoin' },
    { code: 'SHIB', description: 'Shiba Inu' },
    { code: 'TRX', description: 'TRON' },
    { code: 'LINK', description: 'Chainlink' },
    { code: 'FDUSD', description: 'First Digital USD' },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: { description: currency.description },
      create: currency,
    });
  }

  console.log('Currencies seeded!');
}

seedCurrencies()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
