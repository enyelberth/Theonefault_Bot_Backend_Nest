# Base fixtures para tests

Estas fixtures permiten ejecutar pruebas sin depender del seed completo.

## Uso rapido

```ts
import { PrismaClient } from '@prisma/client';
import {
  cleanupBaseFixtures,
  createBaseFixtures,
  createTradingOrderFixture,
} from './fixtures/base-fixtures';

const prisma = new PrismaClient();

describe('analytics', () => {
  let fixtureTag: string;

  beforeAll(async () => {
    const fixtures = await createBaseFixtures(prisma);
    fixtureTag = fixtures.fixtureTag;

    await createTradingOrderFixture(prisma, {
      accountId: fixtures.accountId,
      strategyTypeId: fixtures.strategyTypeId,
      profitLoss: 15.25,
      status: 'CLOSED',
    });
  });

  afterAll(async () => {
    await cleanupBaseFixtures(prisma, fixtureTag);
    await prisma.$disconnect();
  });
});
```

## Que crea

- Usuario de pruebas con rol ADMIN
- Tipo de cuenta bancario SPOT aislado por etiqueta
- Cuenta principal y cuenta offset para sync Binance
- Monedas base y quote (por defecto BTC/USDT)
- Balance inicial por cuenta
- Estado de transaccion y strategyType para pruebas

## Que limpia

- Ordenes y ejecuciones de trading
- Logs de sync Binance
- Snapshots diarios
- Asientos y lineas asociadas
- Cuentas, estado, tipo de cuenta, strategyType y usuario fixture
