import { BinanceService } from "src/binance/binance.service";
import { GridBuyStrategy } from "src/strategies/grid-buy.strategy";
import { GridFullStrategy } from "src/strategies/grid_full_strategy";
import { RsiStrategy } from "src/strategies/rsi.strategy";
import { TradingStrategy } from "src/strategies/trading-strategy.interface";


export class StrategyFactory {
  static createStrategy(type: string, binanceService: BinanceService, symbol: string, config: any): TradingStrategy {
    switch (type) {
      case 'gridBuy':
        const grid = new GridBuyStrategy(binanceService);
        grid.symbol = symbol;
        grid.config = config;
        return grid;
      case 'rsi':
        const rsi = new RsiStrategy(binanceService);
        rsi.symbol = symbol;
        rsi.config = config;
        return rsi;
      case 'gridFull':
        const gridFull = new GridFullStrategy(binanceService);
        gridFull.symbol = symbol;
        gridFull.config = config;
        return gridFull;
      default:
        throw new Error(`Estrategia desconocida: ${type}`);
    }
  }
}
