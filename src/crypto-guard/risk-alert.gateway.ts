import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { StrategyOpsService } from '../strategy-monitoring/strategy-ops.service';
import { BinanceAccountService } from '../binance/binance-account.service';
import { Logger } from '@nestjs/common';

interface RiskAlertPayload {
  type: string;
  strategyId?: string;
  symbol?: string;
  reason?: string;
  timestamp: string;
  severity: 'WARNING' | 'CRITICAL';
}

@WebSocketGateway({ cors: { origin: '*' } })
export class RiskAlertGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RiskAlertGateway.name);
  private notifiedRiskEvents = new Set<string>();
  private maxNotifiedEvents = 1000;
  private riskCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly strategyOps: StrategyOpsService,
    private readonly binanceAccount: BinanceAccountService,
  ) {}

  async afterInit() {
    this.logger.log('RiskAlertGateway initialized');
    this.startRiskMonitoring();
  }

  private startRiskMonitoring() {
    this.riskCheckInterval = setInterval(() => {
      this.checkAndEmitRiskEvents();
      this.checkAndEmitLiquidationWarning();
    }, 15000);
  }

  private async checkAndEmitRiskEvents() {
    const executionLog = this.strategyOps.getExecutionLog();
    const riskEvents = executionLog.filter(
      (event: any) =>
        event.eventType === 'RISK_BLOCKED' ||
        event.eventType === 'RISK_LIQUIDATION_TRIGGERED',
    );

    for (const event of riskEvents) {
      const eventKey = `${event.timestamp}|${event.eventType}|${(event.payload as any)?.strategyId || 'unknown'}`;

      if (!this.notifiedRiskEvents.has(eventKey)) {
        this.notifiedRiskEvents.add(eventKey);

        if (this.notifiedRiskEvents.size > this.maxNotifiedEvents) {
          const firstKey = this.notifiedRiskEvents.values().next().value;
          this.notifiedRiskEvents.delete(firstKey);
        }

        const payload: RiskAlertPayload = {
          type: String(event.eventType),
          strategyId: (event.payload as any)?.strategyId,
          symbol: (event.payload as any)?.symbol,
          reason: (event.payload as any)?.reason,
          timestamp: new Date(event.timestamp as string | number).toISOString(),
          severity:
            event.eventType === 'RISK_LIQUIDATION_TRIGGERED'
              ? 'CRITICAL'
              : 'WARNING',
        };

        this.server.emit('riskAlert', payload);
        this.logger.warn(
          `Risk alert emitted: ${JSON.stringify(payload)}`,
        );
      }
    }
  }

  private async checkAndEmitLiquidationWarning() {
    try {
      const marginStatus =
        await this.binanceAccount.getMarginUtilization();

      if (marginStatus && (marginStatus as any).marginEnabled) {
        const marginLevelStr = (marginStatus as any).marginLevel;
        if (marginLevelStr) {
          const marginLevel = parseFloat(marginLevelStr);

          if (marginLevel <= 1.5) {
            const payload = {
              marginLevel: marginLevel.toFixed(4),
              riskLevel: (marginStatus as any).riskLevel,
              totalLiabilityBtc: (marginStatus as any).totalLiabilityOfBtc,
              timestamp: new Date().toISOString(),
              severity:
                marginLevel <= 1.1
                  ? 'CRITICAL'
                  : marginLevel <= 1.5
                    ? 'WARNING'
                    : 'INFO',
            };

            this.server.emit('liquidationWarning', payload);
            this.logger.warn(
              `Liquidation warning emitted: marginLevel=${marginLevel}`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        'Error checking liquidation warning',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  @SubscribeMessage('getRiskSnapshot')
  handleRiskSnapshot(@ConnectedSocket() client: Socket) {
    const executionLog = this.strategyOps.getExecutionLog();
    const recentEvents = executionLog.slice(-20);

    client.emit('riskSnapshot', {
      events: recentEvents,
      timestamp: new Date().toISOString(),
      totalEvents: executionLog.length,
    });

    return {
      status: 'ok',
      message: 'Risk snapshot sent',
    };
  }

  @SubscribeMessage('subscribeRisk')
  handleSubscribeRisk(@ConnectedSocket() client: Socket) {
    client.join('risk-alerts');
    this.logger.log(`Client ${client.id} subscribed to risk-alerts`);

    return {
      status: 'subscribed',
      room: 'risk-alerts',
    };
  }

  @SubscribeMessage('unsubscribeRisk')
  handleUnsubscribeRisk(@ConnectedSocket() client: Socket) {
    client.leave('risk-alerts');
    this.logger.log(`Client ${client.id} unsubscribed from risk-alerts`);

    return {
      status: 'unsubscribed',
      room: 'risk-alerts',
    };
  }

  onModuleDestroy() {
    if (this.riskCheckInterval !== null) {
      clearInterval(this.riskCheckInterval as any);
    }
  }
}
