import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTransactionStatus() {
  const statuses = [
    { id: 1, statusName: 'Failed' },
    { id: 2, statusName: 'Pending' },
    { id: 3, statusName: 'Confirmed' },
    { id: 4, statusName: 'Completed' },
    { id: 5, statusName: 'Processing' },
  ];

  for (const status of statuses) {
    await prisma.transactionStatus.upsert({
      where: { id: status.id },
      update: {},
      create: status,
    });
  }

  console.log('TransactionStatus seeded!');
}

seedTransactionStatus()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
