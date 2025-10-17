import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { BinanceController } from './binance.controller';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';
import { CryptoPriceModule } from 'src/crypto-price/crypto-price.module';

@Module({

  exports: [BinanceService],
  controllers: [BinanceController],
  providers: [BinanceService],
})
export class BinanceModule {}
