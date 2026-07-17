import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TradingExecutionController } from './trading-execution.controller';
import { TradingExecutionService } from './trading-execution.service';

@Module({
  controllers: [TradingExecutionController],
  providers: [TradingExecutionService, PrismaClient],
  exports: [TradingExecutionService],
})
export class TradingExecutionModule {}
