import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BotRunnerModule } from '../bot-runner/bot-runner.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [BotRunnerModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, PrismaClient],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
