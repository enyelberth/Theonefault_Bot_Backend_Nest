import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as WebSocket from 'ws';
import { MarketDataService } from './market-data.service';
import { SymbolRegistryService } from './symbol-registry.service';

const INTERVALS = ['1m', '5m', '15m', '1h'] as const;
type Interval = typeof INTERVALS[number];

interface KlineMessage {
  stream: string;
  data: {
    e: 'kline';
    E: number;
    s: string;
    k: {
      t: number; // openTime
      T: number; // closeTime
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      n: number;
      x: boolean; // isClosed
    };
  };
}

@Injectable()
export class KlineCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KlineCollectorService.name);
  private ws: WebSocket | null = null;
  private currentSubscribed = new Set<string>();
  private resubscribeTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly marketData: MarketDataService,
    private readonly symbolRegistry: SymbolRegistryService,
  ) {}

  async onModuleInit() {
    await this.reconcileSubscriptions();
    this.resubscribeTimer = setInterval(
      () => this.reconcileSubscriptions().catch((e) => this.logger.error('reconcile err', e)),
      60_000,
    );
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.resubscribeTimer) clearInterval(this.resubscribeTimer);
    this.ws?.terminate();
  }

  private async reconcileSubscriptions() {
    const symbols = await this.symbolRegistry.getActiveSymbols();
    const desired = new Set<string>();
    for (const s of symbols) {
      for (const i of INTERVALS) {
        desired.add(`${s.toLowerCase()}@kline_${i}`);
      }
    }

    const desiredKey = Array.from(desired).sort().join(',');
    const currentKey = Array.from(this.currentSubscribed).sort().join(',');
    if (desiredKey === currentKey && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.currentSubscribed = desired;
    await this.reconnect();
  }

  private async reconnect() {
    if (this.stopped) return;

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.terminate();
      } catch {}
      this.ws = null;
    }

    const streams = Array.from(this.currentSubscribed).join('/');
    if (!streams) {
      this.logger.warn('No streams to subscribe');
      return;
    }
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    this.logger.log(`Connecting kline WS (${this.currentSubscribed.size} streams)`);

    const socket = new WebSocket(url);
    this.ws = socket;

    socket.on('open', () => this.logger.log('Binance kline WS open'));

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as KlineMessage;
        if (msg.data?.e !== 'kline') return;
        const k = msg.data.k;
        if (!k.x) return; // ignora velas no cerradas

        await this.marketData.upsertCandle({
          symbol: k.s.toUpperCase(),
          interval: k.i,
          openTime: new Date(k.t),
          closeTime: new Date(k.T),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
          trades: k.n,
        });
      } catch (err) {
        this.logger.error('kline msg err', err as Error);
      }
    });

    socket.on('error', (err) => this.logger.error('kline WS err', err));

    socket.on('close', () => {
      if (this.stopped) return;
      this.logger.warn('kline WS closed. Reconnect in 5s');
      setTimeout(() => this.reconnect().catch(() => {}), 5000);
    });
  }
}
