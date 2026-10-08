import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { PaperExchangeModule } from '../exchanges/paper/paper-exchange.module';
import { ExchangeSelector } from '../bot-runner/exchange-selector.service';
import { BotRunnerRepository } from '../bot-runner/bot-runner.repository';
import { RiskModule } from '../risk/risk.module';
import { CopySignalBus } from './copy-signal.bus';
import { CopyTradingController } from './copy-trading.controller';
import { CopyTradingRepository } from './copy-trading.repository';
import { CopyTradingService } from './copy-trading.service';
import { CopyExecutorService } from './copy-executor.service';

@Module({
  imports: [ExchangesModule, PaperExchangeModule, RiskModule],
  providers: [
    CopySignalBus,
    CopyTradingRepository,
    CopyTradingService,
    CopyExecutorService,
    ExchangeSelector,
    BotRunnerRepository,
    PrismaClient,
  ],
  controllers: [CopyTradingController],
  exports: [CopySignalBus, CopyTradingService],
})
export class CopyTradingModule {}
