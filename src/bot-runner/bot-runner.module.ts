import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { PaperExchangeModule } from '../exchanges/paper/paper-exchange.module';
import { StrategiesV2Module } from '../strategies/v2/strategies-v2.module';
import { RiskModule } from '../risk/risk.module';
import { BotRunnerController } from './bot-runner.controller';
import { BotRunnerService } from './bot-runner.service';
import { BotRunnerRepository } from './bot-runner.repository';
import { BotRunnerReconciler } from './bot-runner.reconciler';
import { ExchangeSelector } from './exchange-selector.service';
import { CopyTradingModule } from '../copy-trading/copy-trading.module';
import { MarketRegimeModule } from '../market-regime/market-regime.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { OperationalAlertsModule } from '../operational-alerts/operational-alerts.module';
import { CapitalLedgerModule } from '../capital-ledger/capital-ledger.module';
import { MarketPredictionModule } from '../market-prediction/market-prediction.module';

@Module({
  imports: [
    ExchangesModule,
    PaperExchangeModule,
    StrategiesV2Module,
    RiskModule,
    CopyTradingModule,
    MarketRegimeModule,
    MarketDataModule,
    OperationalAlertsModule,
    CapitalLedgerModule,
    MarketPredictionModule,
  ],
  providers: [
    BotRunnerService,
    BotRunnerRepository,
    BotRunnerReconciler,
    ExchangeSelector,
    PrismaClient,
  ],
  controllers: [BotRunnerController],
  exports: [BotRunnerService, ExchangeSelector, BotRunnerRepository],
})
export class BotRunnerModule {}
