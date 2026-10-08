import 'dotenv/config';
import {
  CopyMode,
  OrderSide,
  PrismaClient,
  RunnerStatus,
} from '@prisma/client';

const prisma = new PrismaClient();
const PREFIX = 'demo-integration-20260805';

async function main() {
  const startedAt = new Date('2026-08-04T12:00:00.000Z');
  const stoppedAt = new Date('2026-08-04T14:00:00.000Z');
  const run = await prisma.botRunnerRun.upsert({
    where: { runId: `${PREFIX}-run` },
    update: {
      status: RunnerStatus.STOPPED,
      finalEquity: 10125,
      realizedPnl: 125,
      peakEquity: 10180,
      stoppedAt,
    },
    create: {
      runId: `${PREFIX}-run`,
      strategyId: `${PREFIX}-strategy`,
      symbol: 'BTCUSDT',
      timeframe: '1m',
      exchangeMode: 'paper',
      exchangeId: 'paper',
      status: RunnerStatus.STOPPED,
      config: { demo: true, source: 'integration-demo.seed' },
      initialEquity: 10000,
      peakEquity: 10180,
      finalEquity: 10125,
      realizedPnl: 125,
      startedAt,
      stoppedAt,
    },
  });

  const trades = [
    {
      orderId: `${PREFIX}-order-1`,
      side: OrderSide.BUY,
      entryPrice: 60000,
      exitPrice: 60150,
      quantity: 0.1,
      fee: 2,
      pnl: 15,
      pnlPct: 0.25,
      initialRisk: 30,
      rMultiple: 0.5,
      reason: 'demo-win',
      marketRegime: 'BULL_TREND',
      openedAt: new Date('2026-08-04T12:10:00.000Z'),
      closedAt: new Date('2026-08-04T12:25:00.000Z'),
    },
    {
      orderId: `${PREFIX}-order-2`,
      side: OrderSide.BUY,
      entryPrice: 60200,
      exitPrice: 60090,
      quantity: 0.1,
      fee: 2,
      pnl: -11,
      pnlPct: -0.18,
      initialRisk: 22,
      rMultiple: -0.5,
      reason: 'demo-loss',
      marketRegime: 'RANGE',
      openedAt: new Date('2026-08-04T12:45:00.000Z'),
      closedAt: new Date('2026-08-04T13:05:00.000Z'),
    },
    {
      orderId: `${PREFIX}-order-3`,
      side: OrderSide.BUY,
      entryPrice: 60100,
      exitPrice: 60225,
      quantity: 0.1,
      fee: 2,
      pnl: 123,
      pnlPct: 2.04,
      initialRisk: 41,
      rMultiple: 3,
      reason: 'demo-win',
      marketRegime: 'BULL_TREND',
      openedAt: new Date('2026-08-04T13:25:00.000Z'),
      closedAt: new Date('2026-08-04T13:55:00.000Z'),
    },
  ];

  for (const trade of trades) {
    const existing = await prisma.botRunnerTrade.findFirst({
      where: { orderId: trade.orderId },
    });
    if (existing) {
      await prisma.botRunnerTrade.update({ where: { id: existing.id }, data: trade });
    } else {
      await prisma.botRunnerTrade.create({ data: { botRunnerRunId: run.id, symbol: 'BTCUSDT', ...trade } });
    }
  }

  const snapshot = await prisma.botRunnerSnapshot.findFirst({
    where: { botRunnerRunId: run.id, extras: { path: ['demo'], equals: true } },
  });
  if (!snapshot) {
    await prisma.botRunnerSnapshot.create({
      data: {
        botRunnerRunId: run.id,
        ts: new Date('2026-08-04T13:55:00.000Z'),
        equity: 10125,
        drawdownPct: 0.54,
        openPositions: 0,
        extras: { demo: true },
      },
    });
  }

  await prisma.executionMetric.upsert({
    where: { correlationId: `${PREFIX}-execution` },
    update: { status: 'FILLED', fillPrice: 60000, filledQuantity: 0.1, notional: 6000 },
    create: {
      botRunnerRunId: run.id,
      correlationId: `${PREFIX}-execution`,
      orderId: `${PREFIX}-order-1`,
      exchange: 'paper',
      mode: 'paper',
      symbol: 'BTCUSDT',
      side: OrderSide.BUY,
      orderType: 'LIMIT',
      status: 'FILLED',
      requestedQuantity: 0.1,
      filledQuantity: 0.1,
      expectedPrice: 60000,
      fillPrice: 60000,
      notional: 6000,
      fee: 2,
      slippageBps: 1.2,
      latencyMs: 85,
      requestedAt: new Date('2026-08-04T12:10:00.000Z'),
      respondedAt: new Date('2026-08-04T12:10:00.085Z'),
    },
  });

  await prisma.operationalAlert.upsert({
    where: { dedupeKey: `${PREFIX}-alert` },
    update: { acknowledgedAt: null, acknowledgedBy: null, occurrenceCount: 1 },
    create: {
      kind: 'INTEGRATION_DEMO',
      severity: 'WARN',
      subject: 'Alerta demo de integración',
      message: 'Registro sintético para validar el panel de alertas.',
      dedupeKey: `${PREFIX}-alert`,
      payload: { demo: true },
    },
  });

  const master = await prisma.copyMaster.upsert({
    where: { runId: `${PREFIX}-run` },
    update: { active: true, name: 'Demo Copy Master' },
    create: {
      runId: `${PREFIX}-run`,
      name: 'Demo Copy Master',
      description: 'Master sintético para validar copy-trading.',
      active: true,
    },
  });
  await prisma.copySubscription.upsert({
    where: { masterId_followerRunId: { masterId: master.id, followerRunId: `${PREFIX}-follower` } },
    update: { active: true },
    create: {
      masterId: master.id,
      followerRunId: `${PREFIX}-follower`,
      exchangeMode: 'paper',
      mode: CopyMode.PROPORTIONAL,
      sizeMultiplier: 1,
      active: true,
    },
  });

  console.log(JSON.stringify({ prefix: PREFIX, runId: run.runId, masterId: master.id }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
