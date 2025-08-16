import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedProfiles() {
  const profiles = [
    {
      firstName: 'Enyelberth',
      lastName: 'Rodriguez',
      phone: '+584149732442',
      birthDate: new Date('2003-12-22'),
      address: 'Venezuela',
      createdAt: new Date(),
    },
    // Puedes agregar más perfiles con datos reales si quieres
  ];

  for (const profile of profiles) {
    await prisma.profile.create({
      data: profile,
    });
  }

  console.log('Profiles seeded!');
}

seedProfiles()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
