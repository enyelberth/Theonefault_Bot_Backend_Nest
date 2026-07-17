import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BinanceModule } from '../../binance/binance.module';
import { BinanceAdapter } from '../adapters/binance.adapter';
import { PaperAccountService } from './paper-account.service';
import { PaperExchangeFactory } from './paper-exchange.factory';
import { PaperController } from './paper.controller';

@Module({
  imports: [BinanceModule],
  providers: [PrismaClient, PaperAccountService, BinanceAdapter, PaperExchangeFactory],
  controllers: [PaperController],
  exports: [PaperAccountService, PaperExchangeFactory],
})
export class PaperExchangeModule {}
