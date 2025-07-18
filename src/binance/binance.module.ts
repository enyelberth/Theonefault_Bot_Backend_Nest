import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';

@Module({
  providers: [BinanceService],
})
export class BinanceModule {}
