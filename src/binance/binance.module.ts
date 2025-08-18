import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';

@Module({
  exports: [BinanceService],
  providers: [BinanceService],
})
export class BinanceModule {}
