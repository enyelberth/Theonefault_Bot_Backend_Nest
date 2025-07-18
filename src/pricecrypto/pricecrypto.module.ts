import { Module } from '@nestjs/common';
import { PricecryptoService } from './pricecrypto.service';
import { BinanceService } from 'src/binance/binance.service';

@Module({
    providers: [PricecryptoService,BinanceService],
    exports: [PricecryptoService],
})
export class PricecryptoModule {}
