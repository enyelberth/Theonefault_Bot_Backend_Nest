import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { StrategiesV2Module } from '../strategies/v2/strategies-v2.module';
import { BacktestingController } from './backtesting.controller';
import { BacktestingService } from './backtesting.service';
import { CandleLoader } from './candle-loader';

@Module({
  imports: [ExchangesModule, StrategiesV2Module],
  controllers: [BacktestingController],
  providers: [BacktestingService, CandleLoader, PrismaClient],
  exports: [BacktestingService],
})
export class BacktestingModule {}
