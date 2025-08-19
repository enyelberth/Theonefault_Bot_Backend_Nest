// strategies/grid-buy.strategy.ts
import { Injectable } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class GridBuyStrategy implements TradingStrategy {
  symbol: string;
  config: any;

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    // Lógica para colocar grids de compra
    console.log(`Ejecutando Grid Buy en ${this.symbol} con config`, this.config);
    // Usa binanceService para colocar órdenes, monitorear, etc.
  }
}
