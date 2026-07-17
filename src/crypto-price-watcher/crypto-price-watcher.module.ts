import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';
import { TradingService } from 'src/trading/trading.service';
import { CryptoPriceWatcherGateway } from './crypto-price-watcher.gateway';
import { IndicatorsModule } from 'src/indicators/indicators.module';

@Module({
  imports: [IndicatorsModule],
  exports: [TradingService],
  providers: [TradingService, CryptoPriceWatcherGateway, BinanceService, AccountService, PrismaClient],
})
export class CryptoPriceWatcherModule {}
