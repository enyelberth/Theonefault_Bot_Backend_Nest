// strategies/rsi.strategy.ts
import { Injectable } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class RsiStrategy implements TradingStrategy {
  symbol: string;
  config: any;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    // Lógica para trading con RSI
    console.log(`Ejecutando estrategia RSI en ${this.symbol}`);
    // Calcular RSI, decidir comprar/vender, etc.
  }
}
