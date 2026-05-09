import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TradingService } from 'src/trading/trading.service';
import { CryptoPriceWatcherGateway } from './crypto-price-watcher.gateway';
import { IndicatorsService } from 'src/indicators/indicators.service';
import { BinanceModule } from 'src/binance/binance.module';
import { AccountModule } from 'src/account/account.module';

@Module({
  imports: [BinanceModule, AccountModule],
  exports: [TradingService],
  providers: [
    TradingService,
    IndicatorsService,
    CryptoPriceWatcherGateway,
    PrismaClient,
  ],
})
export class CryptoPriceWatcherModule {}
