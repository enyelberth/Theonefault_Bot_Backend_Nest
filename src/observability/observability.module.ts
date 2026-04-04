import { Global, Module } from '@nestjs/common';
import { ObservabilityService } from './observability.service';

@Global()
@Module({
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
