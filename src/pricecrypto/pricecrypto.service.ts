import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { BinanceService } from 'src/binance/binance.service';

@Injectable()
export class PricecryptoService {
    constructor(private readonly binanceService: BinanceService) {}
    @Cron(CronExpression.EVERY_5_SECONDS)
    async saludar(){
//this.ObtenerPrecioCrypto('BTCFDUSD');
      //  console.log(process.env.BASE_URL);
       // console.log("Hola desde PricecryptoService");
     //   this.hola();
    }
    async ObtenerPrecioCrypto(crypto: string): Promise<string> {
        const res = await axios.get(`${process.env.BASE_URL}/api/v3/exchangeInfo?symbol=${crypto}`);
        console.log(res.data);
        this.hola();
        return `El precio de ${crypto} es $${res.data.price}`;
    }
    async hola (): Promise<any> {
        return this.binanceService.firmar();
    }
}
