import { Module } from '@nestjs/common';
import { PricecryptoService } from './pricecrypto.service';
import { BinanceModule } from 'src/binance/binance.module';

@Module({
    imports: [BinanceModule],
    providers: [PricecryptoService],
    exports: [PricecryptoService],
})
export class PricecryptoModule {}
