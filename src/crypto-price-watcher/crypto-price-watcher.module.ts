import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';
import { TradingService } from 'src/trading/trading.service';

@Module({
  exports: [TradingService],
  providers: [TradingService, BinanceService,AccountService, PrismaClient],
})
export class CryptoPriceWatcherModule {}
