import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { TradingExecutionController } from './trading-execution.controller';
import { TradingExecutionService } from './trading-execution.service';

@Module({
  imports: [PrismaModule],
  controllers: [TradingExecutionController],
  providers: [TradingExecutionService],
  exports: [TradingExecutionService],
})
export class TradingExecutionModule {}