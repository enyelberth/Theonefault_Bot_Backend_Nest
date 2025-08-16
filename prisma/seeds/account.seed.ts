import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAccounts() {
  const accounts = [
    {
      userId: 1,           // Asegúrate que exista el usuario con este ID
      bankAccountTypeId: 1, // Asegúrate que exista este tipo de cuenta bancaria o usa un ID válido
      key: 'asdas',
      secretKey: 'asda',
      email: 'enyelberthrc22.Z@gmail.com',
      password: '30204334',
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
