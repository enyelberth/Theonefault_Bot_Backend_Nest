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

@Module({
  imports: [ScheduleModule.forRoot(), ProfileModule,AccountModule, PricecryptoModule, BinanceModule, CryptoPairModule, CryptoPriceModule, PruebaModule, TransactionModule, UserModule, BankAccountTypeServiceModule],
  controllers: [AppController, ProfileController],
  providers: [AppService, ProfileService, PruebaService],
})
export class AppModule {}
