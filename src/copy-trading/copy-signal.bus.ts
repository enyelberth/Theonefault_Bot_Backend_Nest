import { EventEmitter } from 'events';
import { Injectable, Logger } from '@nestjs/common';
import type { Signal } from '../exchanges/domain';

export interface CopySignalEvent {
  masterRunId: string;
  masterEquity: number;
  signal: Signal;
  emittedAt: number;
}

export type CopySignalHandler = (event: CopySignalEvent) => void | Promise<void>;

@Injectable()
export class CopySignalBus {
  private readonly logger = new Logger(CopySignalBus.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(500);
  }

  publish(event: CopySignalEvent): void {
    this.emitter.emit('copy-signal', event);
  }

  subscribe(handler: CopySignalHandler): () => void {
    this.emitter.on('copy-signal', handler);
    return () => this.emitter.off('copy-signal', handler);
  }
}
