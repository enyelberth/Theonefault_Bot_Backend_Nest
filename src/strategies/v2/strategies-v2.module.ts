import { Module } from '@nestjs/common';
import { StrategyRegistry } from './registry/strategy-registry';

@Module({
  providers: [StrategyRegistry],
  exports: [StrategyRegistry],
})
export class StrategiesV2Module {}
