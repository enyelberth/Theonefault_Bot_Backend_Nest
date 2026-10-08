import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BinanceService } from './binance.service';
import { BinanceController } from './binance.controller';
import { PaperExchangeService } from './paper-exchange.service';
import { PaperExchangeController } from './paper-exchange.controller';
import { BinanceWalletHistoryService } from './binance-wallet-history.service';

@Module({
  exports: [BinanceService, PaperExchangeService, BinanceWalletHistoryService],
  controllers: [BinanceController, PaperExchangeController],
  providers: [
    BinanceService,
    PaperExchangeService,
    BinanceWalletHistoryService,
    PrismaClient,
  ],
})
export class BinanceModule {}
