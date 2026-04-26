import { Module } from '@nestjs/common';
import { PruebaService } from './prueba.service';
import { PrismaClient } from '@prisma/client';
import { BinanceModule } from 'src/binance/binance.module';
import { CryptoPriceModule } from 'src/crypto-price/crypto-price.module';
import { TradingModule } from 'src/trading/trading.module';

@Module({
  imports: [BinanceModule, CryptoPriceModule, TradingModule],
  providers: [PruebaService, PrismaClient],
})
export class PruebaModule {}
