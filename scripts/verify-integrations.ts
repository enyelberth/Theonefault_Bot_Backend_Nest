import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { CopySignalBus } from '../src/copy-trading/copy-signal.bus';
import { OperationalAlertsService } from '../src/operational-alerts/operational-alerts.service';
import { MarketRegimeService } from '../src/market-regime/market-regime.service';
import { CryptoPriceService } from '../src/crypto-price/crypto-price.service';
import { AuditService } from '../src/audit/audit.service';

const prisma = new PrismaClient();

async function main() {
  const priceService = new CryptoPriceService(prisma);
  const analytics = new AnalyticsService(prisma, priceService);
  const alerts = new OperationalAlertsService(prisma);
  const regimes = new MarketRegimeService(prisma);
  const audit = new AuditService(prisma);
  const auditRequestId = 'verify-integrations';
  const existingAudit = await prisma.auditEvent.findFirst({ where: { requestId: auditRequestId } });
  if (!existingAudit) {
    await audit.record({
      requestId: auditRequestId,
      method: 'VERIFY',
      path: '/verify/integrations',
      statusCode: 200,
      durationMs: 1,
      metadata: { source: 'integration-verification' },
    });
  }
  const [summary, equity, drawdown, execution, alertRows, masters, regime] =
    await Promise.all([
      analytics.summary({}),
      analytics.equityCurve({}),
      analytics.drawdown({}),
      analytics.execution({}),
      alerts.list({ onlyUnacknowledged: true, limit: 100 }),
      prisma.copyMaster.findMany({ orderBy: { id: 'asc' } }),
      regimes.current('BTCUSDT', '1m', 100),
    ]);

  const bus = new CopySignalBus();
  const sseEvent = new Promise<boolean>((resolve) => {
    const subscription = bus.subscribe((event) => {
      subscription();
      resolve(event.masterRunId === 'verify-sse');
    });
    bus.publish({
      masterRunId: 'verify-sse',
      masterEquity: 10000,
      signal: { action: 'HOLD', symbol: 'BTCUSDT', emittedAt: Date.now() },
      emittedAt: Date.now(),
    });
  });

  const verified = {
    analyticsTrades: summary.metrics.totalTrades,
    equityPoints: equity.points.length,
    drawdownPoints: drawdown.underwater.length,
    executionAttempts: execution.metrics?.attempts ?? 0,
    alerts: alertRows.length,
    copyMasters: masters.length,
    regime: {
      symbol: regime.symbol,
      timeframe: regime.timeframe,
      trend: regime.trend,
      confidence: regime.confidence,
    },
    sseObservable: await sseEvent,
    auditEvents: await prisma.auditEvent.count({ where: { requestId: auditRequestId } }),
  };

  if (!verified.analyticsTrades || verified.equityPoints < 2 || !verified.sseObservable || !verified.auditEvents) {
    throw new Error(`Integration verification incomplete: ${JSON.stringify(verified)}`);
  }
  console.log(JSON.stringify(verified));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
