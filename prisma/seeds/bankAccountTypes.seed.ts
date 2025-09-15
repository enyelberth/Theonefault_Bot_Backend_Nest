import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBankAccountTypes() {
  const bankAccountTypes = [
    {
      typeName: 'Spot',
      description: 'Es la cuenta principal donde se almacenan las criptomonedas que posees realmente.',
      createdAt: new Date(),
    },
    {
      typeName: 'Margin Cruzado',
      description: 'Usa todo el saldo de tu cuenta Margin para mantener todas las posiciones abiertas. Si una posición pierde, el riesgo se reparte en todos los activos en Margin.',
      createdAt: new Date(),
    },
    {
      typeName: 'Margin Aislado',
      description: 'Cada par o posición tiene un margen específico asignado (colateral separado).',
      createdAt: new Date(),
    },
        {
      typeName: 'Fondos',
      description: 'Fondos disponibles para trading.',
      createdAt: new Date(),
    },
    
    // Puedes agregar más tipos si quieres
  ];

  for (const bankAccountType of bankAccountTypes) {
    await prisma.bankAccountType.create({
      data: bankAccountType,
    });
  }

  console.log('BankAccountTypes seeded!');
}

seedBankAccountTypes()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
