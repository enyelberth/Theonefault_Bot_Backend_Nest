import { Prisma, OrderSide } from '@prisma/client';
import { BotRunnerRepository } from './bot-runner.repository';

/**
 * Mock mínimo de Prisma que simula una fila real de BotRunnerTrade,
 * incluido el semántico de `{ increment }` de Prisma, para poder probar
 * recordPartialClose() + closeTrade() encadenados tal como corren en
 * producción (cada partial close lee la fila ya actualizada por el
 * anterior).
 */
function buildTradeStore(initial: {
  side: OrderSide;
  entryPrice: number;
  quantity: number;
  fee: number;
}) {
  const row: any = {
    id: 1,
    side: initial.side,
    entryPrice: new Prisma.Decimal(initial.entryPrice),
    quantity: new Prisma.Decimal(initial.quantity),
    fee: new Prisma.Decimal(initial.fee),
    closedQuantity: new Prisma.Decimal(0),
    // Mismo default que openTrade() real: la fee de entrada arranca
    // realizedPnlToDate en negativo (costo hundido desde el día 1).
    realizedPnlToDate: new Prisma.Decimal(initial.fee).negated(),
    peakPrice: null,
    troughPrice: null,
    initialRisk: null,
    reason: null,
  };

  const applyIncrement = (current: Prisma.Decimal, data: unknown): Prisma.Decimal => {
    if (data && typeof data === 'object' && 'increment' in (data as any)) {
      return current.plus((data as any).increment as any);
    }
    return new Prisma.Decimal(data as any);
  };

  const prisma = {
    botRunnerTrade: {
      findUnique: jest.fn(async () => ({ ...row })),
      update: jest.fn(async ({ data }: any) => {
        for (const key of Object.keys(data)) {
          if (key === 'closedQuantity' || key === 'realizedPnlToDate' || key === 'fee') {
            row[key] = applyIncrement(row[key], data[key]);
          } else {
            row[key] = data[key];
          }
        }
        return { ...row };
      }),
    },
  } as any;

  return { prisma, row };
}

describe('BotRunnerRepository -- tp-ladder partial-close pnl accounting', () => {
  it('closeTrade() with no prior partial fills behaves exactly as a plain full close (backward compatible)', async () => {
    const { prisma } = buildTradeStore({
      side: OrderSide.BUY,
      entryPrice: 100,
      quantity: 10,
      fee: 1, // fee de entrada
    });
    const repo = new BotRunnerRepository(prisma);

    const closed = await repo.closeTrade({
      tradeId: 1,
      orderId: 'o1',
      exitPrice: 110,
      additionalFee: 1,
    });

    // pnl = (110-100)*10 - (1+1) = 100 - 2 = 98
    expect(Number(closed.pnl)).toBeCloseTo(98, 8);
  });

  it('blends partial fills correctly instead of valuing 100% of the position at the final (best) price', async () => {
    const { prisma } = buildTradeStore({
      side: OrderSide.BUY,
      entryPrice: 100,
      quantity: 10,
      fee: 0,
    });
    const repo = new BotRunnerRepository(prisma);

    // Nivel 1: 25% (2.5 u) a +1% (101)
    const p1 = await repo.recordPartialClose({
      tradeId: 1,
      exitPrice: 101,
      quantity: 2.5,
      fee: 0,
    });
    expect(p1.pnl).toBeCloseTo((101 - 100) * 2.5, 8); // 2.5

    // Nivel 2: 50% (5 u) a +2% (102)
    const p2 = await repo.recordPartialClose({
      tradeId: 1,
      exitPrice: 102,
      quantity: 5,
      fee: 0,
    });
    expect(p2.pnl).toBeCloseTo((102 - 100) * 5, 8); // 10

    // Nivel 3 (final, el resto: 2.5 u) a +5% (105) -- cierre completo
    const closed = await repo.closeTrade({
      tradeId: 1,
      orderId: 'o1',
      exitPrice: 105,
      additionalFee: 0,
    });

    // Bug viejo hubiera dado (105-100)*10 = 50 (TODO el volumen al mejor precio).
    // Correcto: 2.5 (nivel1) + 10 (nivel2) + (105-100)*2.5 (resto) = 2.5+10+12.5 = 25
    const buggyOldPnl = (105 - 100) * 10;
    const correctPnl = 2.5 + 10 + (105 - 100) * 2.5;
    expect(Number(closed.pnl)).toBeCloseTo(correctPnl, 8);
    expect(Number(closed.pnl)).toBeLessThan(buggyOldPnl);
  });

  it('accumulates fees from entry + every partial fill + the final fill', async () => {
    const { prisma } = buildTradeStore({
      side: OrderSide.BUY,
      entryPrice: 100,
      quantity: 10,
      fee: 1, // fee de apertura
    });
    const repo = new BotRunnerRepository(prisma);

    await repo.recordPartialClose({ tradeId: 1, exitPrice: 101, quantity: 5, fee: 0.5 });
    const closed = await repo.closeTrade({
      tradeId: 1,
      orderId: 'o1',
      exitPrice: 102,
      additionalFee: 0.5,
    });

    expect(Number(closed.fee)).toBeCloseTo(1 + 0.5 + 0.5, 8);
  });

  it('works symmetrically for SELL (short) positions', async () => {
    const { prisma } = buildTradeStore({
      side: OrderSide.SELL,
      entryPrice: 100,
      quantity: 10,
      fee: 0,
    });
    const repo = new BotRunnerRepository(prisma);

    // SHORT: ganancia cuando el precio baja. Nivel 1: 50% a 95 (precio bajó -5%)
    const p1 = await repo.recordPartialClose({
      tradeId: 1,
      exitPrice: 95,
      quantity: 5,
      fee: 0,
    });
    expect(p1.pnl).toBeCloseTo((100 - 95) * 5, 8); // 25

    const closed = await repo.closeTrade({
      tradeId: 1,
      orderId: 'o1',
      exitPrice: 90, // resto cerrado a 90 (mejor para el short)
      additionalFee: 0,
    });
    const correctPnl = 25 + (100 - 90) * 5;
    expect(Number(closed.pnl)).toBeCloseTo(correctPnl, 8);
  });
});
