import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface StrategyRuntimeContext {
  strategyId: string;
  strategyType: string;
  symbol: string;
  config?: Record<string, unknown>;
}

@Injectable()
export class StrategyRuntimeContextService {
  private readonly storage = new AsyncLocalStorage<StrategyRuntimeContext>();

  runWithContext<T>(context: StrategyRuntimeContext, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(context, fn);
  }

  getContext(): StrategyRuntimeContext | undefined {
    return this.storage.getStore();
  }
}
