import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RiskManagerService } from './risk-manager.service';
import { RiskController } from './risk.controller';

@Module({
  providers: [RiskManagerService, PrismaClient],
  controllers: [RiskController],
  exports: [RiskManagerService],
})
export class RiskModule {}
