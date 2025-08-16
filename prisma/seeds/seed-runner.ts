import { exec } from 'child_process';

async function runSeedScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = `ts-node ${scriptPath}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error ejecutando ${scriptPath}:`, error);
        reject(error);
        return;
      }
      if (stdout) {
        console.log(stdout);
      }
      if (stderr) {
        console.error(stderr);
      }
      resolve();
    });
  });
}

async function runAllSeeds() {
  try {
    console.log('Iniciando seed de TransactionStatus...');
    await runSeedScript('prisma/seeds/transaction-status.seed.ts');

    console.log('Iniciando seed de Currency...');
    await runSeedScript('prisma/seeds/currency.seed.ts');

    console.log('Iniciando seed de Triggers y Procedures...');
    await runSeedScript('prisma/seeds/db-triggers.seed.ts');

    console.log('Iniciando seed de Profile...');
    await runSeedScript('prisma/seeds/profile.seed.ts');

    console.log('Iniciando seed de User...');
    await runSeedScript('prisma/seeds/user.seed.ts');

    console.log('Iniciando seed de BankAccountTypes ...');
    await runSeedScript('prisma/seeds/bankAccountTypes.seed.ts');

    console.log('Iniciando seed de Account ...');
    await runSeedScript('prisma/seeds/account.seed.ts');

    console.log('Todos los seeds han sido ejecutados exitosamente.');
  } catch (error) {
    console.error('Error ejecutando seeds:', error);
  }
}

runAllSeeds();
