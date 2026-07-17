import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { DashboardService } from './dashboard.service';

const BROADCAST_INTERVAL_MS = 1000;

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/dashboard',
})
export class DashboardGateway
  implements OnGatewayInit, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() server: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private readonly dashboard: DashboardService) {}

  afterInit() {
    this.logger.log('Dashboard WS gateway initialized');
  }

  onModuleInit() {
    this.timer = setInterval(
      () => this.tick().catch((e) => this.logger.error('tick err', e)),
      BROADCAST_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.busy) return;
    if (!this.server) return;
    const room = this.server.sockets;
    if (!room || (room as any).sockets?.size === 0) {
      // opcional: emitir de todos modos para logging
    }
    this.busy = true;
    try {
      const summaries = await this.dashboard.getActiveBotSummaries();
      const global = await this.dashboard.getGlobalStats();
      this.server.emit('dashboard:tick', {
        ts: new Date().toISOString(),
        global,
        bots: summaries,
      });
    } finally {
      this.busy = false;
    }
  }
}
