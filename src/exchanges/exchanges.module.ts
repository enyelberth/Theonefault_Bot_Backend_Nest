import { Module } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { BinanceAdapter } from './adapters/binance.adapter';
import { ExchangeFactory } from './exchange.factory';

@Module({
  imports: [BinanceModule],
  providers: [BinanceAdapter, ExchangeFactory],
  exports: [BinanceAdapter, ExchangeFactory],
})
export class ExchangesModule {}
