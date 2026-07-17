import { Injectable } from '@nestjs/common';
import type { IStrategy } from '../strategy.interface';
import { SmaCrossStrategy } from '../samples/sma-cross.strategy';
import { GridStrategy } from '../templates/grid.strategy';
import { DcaStrategy } from '../templates/dca.strategy';
import { MartingaleStrategy } from '../templates/martingale.strategy';

export type StrategyFactory = () => IStrategy<any>;

@Injectable()
export class StrategyRegistry {
  private readonly factories = new Map<string, StrategyFactory>();

  constructor() {
    this.register('sma-cross', () => new SmaCrossStrategy());
    this.register('grid', () => new GridStrategy());
    this.register('dca', () => new DcaStrategy());
    this.register('martingale', () => new MartingaleStrategy());
  }

  register(id: string, factory: StrategyFactory): void {
    this.factories.set(id, factory);
  }

  create(id: string): IStrategy<any> {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Strategy "${id}" not found`);
    return factory();
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  list(): { id: string; metadata: IStrategy['metadata'] }[] {
    return Array.from(this.factories.entries()).map(([id, factory]) => ({
      id,
      metadata: factory().metadata,
    }));
  }
}
