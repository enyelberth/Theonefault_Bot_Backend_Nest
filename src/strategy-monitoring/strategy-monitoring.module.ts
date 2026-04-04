import { Global, Module } from '@nestjs/common';
import { StrategyRuntimeContextService } from './strategy-runtime-context.service';
import { StrategyOpsService } from './strategy-ops.service';

@Global()
@Module({
  providers: [StrategyRuntimeContextService, StrategyOpsService],
  exports: [StrategyRuntimeContextService, StrategyOpsService],
})
export class StrategyMonitoringModule {}
