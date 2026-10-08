import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedUsers() {
  const email = process.env.SEED_USER_EMAIL;
  const password = process.env.SEED_USER_PASSWORD;
  const username = process.env.SEED_USER_USERNAME;
  const key = process.env.SEED_USER_KEY;
  const secretKey = process.env.SEED_USER_SECRET_KEY;
  if (!email || !password || !username || !key || !secretKey) {
    throw new Error('SEED_USER_EMAIL, SEED_USER_PASSWORD, SEED_USER_USERNAME, SEED_USER_KEY and SEED_USER_SECRET_KEY are required');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const users = [
    {
      email,
      password: hashedPassword,
      username,
      createdAt: new Date(),
      profileId: 1,    // Asegúrate que el perfil con id 1 exista o ajusta el valor
      key,
      secretKey,
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
