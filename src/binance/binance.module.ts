import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BinanceService } from './binance.service';
import { BinanceController } from './binance.controller';
import { PaperExchangeService } from './paper-exchange.service';
import { PaperExchangeController } from './paper-exchange.controller';

@Module({
  exports: [BinanceService, PaperExchangeService],
  controllers: [BinanceController, PaperExchangeController],
  providers: [BinanceService, PaperExchangeService, PrismaClient],
})
export class BinanceModule {}
