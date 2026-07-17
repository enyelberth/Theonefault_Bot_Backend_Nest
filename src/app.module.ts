import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProfileController } from './profile/profile.controller';
import { ProfileService } from './profile/profile.service';
import { ProfileModule } from './profile/profile.module';

import { PricecryptoModule } from './pricecrypto/pricecrypto.module';
import { BinanceModule } from './binance/binance.module';
import { AccountModule } from './account/account.module';
import { CryptoPairModule } from './crypto-pair/crypto-pair.module';
import { CryptoPriceModule } from './crypto-price/crypto-price.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PruebaService } from './prueba/prueba.service';
import { PruebaModule } from './prueba/prueba.module';
import { TransactionModule } from './transaction/transaction.module';
import { UserModule } from './user/user.module';
import { BankAccountTypeServiceModule } from './account/BankAccountType/bankAccountType.module';
import { JournalEntryModule } from './transaction/journalEntry/journalEntry.module';
import { TradingModule } from './trading/trading.module';
import { CryptoPriceWatcherModule } from './crypto-price-watcher/crypto-price-watcher.module';
import { CryptoPriceWatcherGateway } from './crypto-price-watcher/crypto-price-watcher.gateway';
import { HttpconfigModule } from './httpconfig/httpconfig.module';
import { BotModule } from './bot/bot.module';
import { StrategiesTradingModule } from './strategies-trading/strategies-trading.module';
import { AuthModule } from './authA/auth.module';
import { NotificationModule } from './notification/notification.module';
import { IndicatorsModule } from './indicators/indicators.module';
import {TelegramBotModule} from './telegram/telegram.module'
import { CryptoGuardModule } from './crypto-guard/crypto-guard.module';
import { AlertModule } from './alert/alert.module';
import { GeminisModule } from './geminis/geminis.module';
import { TelegramSofiaModule } from './telegram-sofia/telegram-sofia.module';
import { MarketDataModule } from './market-data/market-data.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RiskManagerModule } from './risk-manager/risk-manager.module';
import { ExchangesModule } from './exchanges/exchanges.module';
import { StrategiesV2Module } from './strategies/v2/strategies-v2.module';
import { BacktestingModule } from './backtesting/backtesting.module';
import { PaperExchangeModule } from './exchanges/paper/paper-exchange.module';
import { BotRunnerModule } from './bot-runner/bot-runner.module';
import { RiskModule } from './risk/risk.module';
import { CopyTradingModule } from './copy-trading/copy-trading.module';
import { SessionModule } from './session/session.module';
import { TradingExecutionModule } from './trading-execution/trading-execution.module';
@Module({
  imports: [AuthModule,ScheduleModule.forRoot(),CryptoPriceWatcherModule,CryptoGuardModule,AlertModule,BotModule,TelegramBotModule,StrategiesTradingModule,TradingModule ,JournalEntryModule, ProfileModule,AccountModule, PricecryptoModule, BinanceModule, ExchangesModule, StrategiesV2Module, BacktestingModule, PaperExchangeModule, RiskModule, BotRunnerModule, CopyTradingModule, CryptoPairModule, CryptoPriceModule, PruebaModule, TransactionModule, UserModule, BankAccountTypeServiceModule, HttpconfigModule, NotificationModule, IndicatorsModule, GeminisModule, TelegramSofiaModule, MarketDataModule, DashboardModule, RiskManagerModule, SessionModule, TradingExecutionModule],
  controllers: [AppController, ProfileController],
  providers: [AppService, ProfileService, PruebaService],
})
export class AppModule {}
