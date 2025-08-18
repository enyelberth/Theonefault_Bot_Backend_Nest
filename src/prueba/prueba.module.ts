import { Module } from '@nestjs/common';
import { PruebaService } from './prueba.service';
import { PrismaClient } from '@prisma/client';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';
import { TradingService } from 'src/trading/trading.service';
import { BinanceService } from 'src/binance/binance.service';

@Module({
  providers: [PruebaService, BinanceService,CryptoPriceService, TradingService, PrismaClient],
})
export class PruebaModule {}
