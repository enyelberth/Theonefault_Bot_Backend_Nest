import { forwardRef, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RiskManagerService } from './risk-manager.service';
import { RiskManagerController } from './risk-manager.controller';
import { BotModule } from 'src/bot/bot.module';
import { DashboardModule } from 'src/dashboard/dashboard.module';
import { BotRunnerModule } from 'src/bot-runner/bot-runner.module';

@Module({
  imports: [forwardRef(() => BotModule), DashboardModule, BotRunnerModule],
  controllers: [RiskManagerController],
  providers: [PrismaClient, RiskManagerService],
  exports: [RiskManagerService],
})
export class RiskManagerModule {}
