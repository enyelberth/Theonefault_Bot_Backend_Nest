import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTriggersAndProcedures() {
  // Crear función para update_account_balance
  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION update_account_balance()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE "AccountBalance"
        SET balance = balance + NEW.amount * CASE WHEN NEW.entryType = 'DEBE' THEN 1 ELSE -1 END
        WHERE accountId = NEW.accountId AND currencyCode = NEW.currencyCode;

        IF NOT FOUND THEN
          INSERT INTO "AccountBalance" ("accountId", "currencyCode", balance)
          VALUES (NEW.accountId, NEW.currencyCode, NEW.amount * CASE WHEN NEW.entryType = 'DEBE' THEN 1 ELSE -1 END);
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;

  const dropTriggerSQL = `
    DROP TRIGGER IF EXISTS journal_entry_line_balance_trigger ON "JournalEntryLine";
  `;

  const createTriggerSQL = `
    CREATE TRIGGER journal_entry_line_balance_trigger
    AFTER INSERT ON "JournalEntryLine"
    FOR EACH ROW
    EXECUTE PROCEDURE update_account_balance();
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
