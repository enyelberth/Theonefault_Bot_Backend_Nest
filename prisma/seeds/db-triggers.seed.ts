import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTriggersAndProcedures() {
  // Crear función para update_account_balance
  const createFunctionSQL = `
CREATE OR REPLACE FUNCTION crear_account_balances_para_nuevo_usuario()
RETURNS TRIGGER AS $$
BEGIN
  -- Inserta un registro en AccountBalance para cada moneda respecto a la nueva cuenta
  INSERT INTO "AccountBalance" ("accountId", "currencyCode", balance)
  SELECT NEW.id, code, 0 -- saldo inicial 0
  FROM "Currency";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

  `;

  const dropTriggerSQL = `
DROP TRIGGER IF EXISTS trigger_crear_account_balances ON "Account";
  `;

  const createTriggerSQL = `
CREATE TRIGGER trigger_crear_account_balances
AFTER INSERT ON "Account"
FOR EACH ROW
EXECUTE FUNCTION crear_account_balances_para_nuevo_usuario();
  `;

  // Ejecutar cada comando por separado
  await prisma.$executeRawUnsafe(createFunctionSQL);
  await prisma.$executeRawUnsafe(dropTriggerSQL);
  await prisma.$executeRawUnsafe(createTriggerSQL);

  console.log('Triggers y procedimientos creados/executados correctamente');
}

seedTriggersAndProcedures()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
