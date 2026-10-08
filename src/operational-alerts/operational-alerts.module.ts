import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { OperationalAlertsController } from './operational-alerts.controller';
import { OperationalAlertsService } from './operational-alerts.service';

@Module({
  controllers: [OperationalAlertsController],
  providers: [OperationalAlertsService, PrismaClient],
  exports: [OperationalAlertsService],
})
export class OperationalAlertsModule {}
