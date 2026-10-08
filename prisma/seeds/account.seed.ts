import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAccounts() {
  const email = process.env.SEED_ACCOUNT_EMAIL;
  const password = process.env.SEED_ACCOUNT_PASSWORD;
  const key = process.env.SEED_ACCOUNT_KEY;
  const secretKey = process.env.SEED_ACCOUNT_SECRET_KEY;
  if (!email || !password || !key || !secretKey) {
    throw new Error('SEED_ACCOUNT_EMAIL, SEED_ACCOUNT_PASSWORD, SEED_ACCOUNT_KEY and SEED_ACCOUNT_SECRET_KEY are required');
  }

  const accounts = [
    {
      userId: 1,           // Asegúrate que exista el usuario con este ID
      bankAccountTypeId: 1, // Asegúrate que exista este tipo de cuenta bancaria o usa un ID válido
      key,
      secretKey,
      email,
      password,
      createdAt: new Date(),
    },
    // Puedes agregar más cuentas si quieres
  ];

  for (const account of accounts) {
    await prisma.account.create({
      data: account,
    });
  }

  console.log('Accounts seeded!');
}

seedAccounts()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
