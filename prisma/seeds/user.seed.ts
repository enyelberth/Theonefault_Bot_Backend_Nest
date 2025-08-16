import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedUsers() {
  const users = [
    {
      email: 'enyelberthrc22.z@gmail.com',
      password: '30204334',
      username: 'enyelberth10',
      createdAt: new Date(),
      profileId: 1,    // Asegúrate que el perfil con id 1 exista o ajusta el valor
      key: 'er12',
      secretKey: 'your_secret_key',
    },
    // Puedes agregar más usuarios si deseas
  ];

  for (const user of users) {
    await prisma.user.create({
      data: user,
    });
  }

  console.log('Users seeded!');
}

seedUsers()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
