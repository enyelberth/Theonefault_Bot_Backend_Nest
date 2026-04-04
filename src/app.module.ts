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
import { HttpconfigModule } from './httpconfig/httpconfig.module';
import { BotModule } from './bot/bot.module';
import { StrategiesTradingModule } from './strategies-trading/strategies-trading.module';
import { AuthModule } from './authA/auth.module';
import { NotificationModule } from './notification/notification.module';
import { IndicatorsModule } from './indicators/indicators.module';
import { TelegramBotModule } from './telegram/telegram.module';
import { CryptoGuardModule } from './crypto-guard/crypto-guard.module';
import { AlertModule } from './alert/alert.module';
import { GeminisModule } from './geminis/geminis.module';
import { TelegramSofiaModule } from './telegram-sofia/telegram-sofia.module';
import { SessionModule } from './session/session.module';
import { CurrencyModule } from './currency/currency.module';
import { AccountBalanceModule } from './account-balance/account-balance.module';
import { TradingExecutionModule } from './trading-execution/trading-execution.module';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    CryptoPriceWatcherModule,
    CryptoGuardModule,
    AlertModule,
    BotModule,
    TelegramBotModule,
    SessionModule,
    CurrencyModule,
    AccountBalanceModule,
    TradingExecutionModule,
    StrategiesTradingModule,
    TradingModule,
    JournalEntryModule,
    ProfileModule,
    AccountModule,
    PricecryptoModule,
    BinanceModule,
    CryptoPairModule,
    CryptoPriceModule,
    PruebaModule,
    TransactionModule,
    UserModule,
    BankAccountTypeServiceModule,
    HttpconfigModule,
    NotificationModule,
    IndicatorsModule,
    GeminisModule,
    TelegramSofiaModule,
  ],
  controllers: [AppController, ProfileController],
  providers: [AppService, ProfileService, PruebaService],
})
export class AppModule {}
