import { BinanceService } from "src/binance/binance.service";
import { GridBuyStrategy } from "src/strategies/grid-buy.strategy";
import { GridBuyMarginStrategy } from "src/strategies/grid_buy_margin.strategy";
import { GridFullStrategy } from "src/strategies/grid_full_strategy";
import { GridSellMarginFixedStrategy } from "src/strategies/grid_sell_margin.fixed.strategy";
import { GridSellMarginStrategy } from "src/strategies/grid_sell_margin.strategy";
import { RsiStrategy } from "src/strategies/rsi.strategy";
import { TradingStrategy } from "src/strategies/trading-strategy.interface";
import {GridBuyMarginFixedStrategy} from "src/strategies/grid_buy_margin_fixed.strategy"

export class StrategyFactory {
  static createStrategy(type: string, binanceService: BinanceService,id:string ,symbol: string, config: any): TradingStrategy {
    switch (type) {
      case 'gridBuy':
        const grid = new GridBuyStrategy(binanceService);
        grid.symbol = symbol;
        grid.config = config;
        grid.id = id;
        return grid;
      case 'gridBuyMargin':
        const gridBuyMargin = new GridBuyMarginStrategy(binanceService);
        gridBuyMargin.symbol = symbol;
        gridBuyMargin.config = config;
        gridBuyMargin.id= id;
        return gridBuyMargin;
      case 'gridSellMargin':
        const gridSellMargin = new GridSellMarginStrategy(binanceService);
        gridSellMargin.symbol = symbol;
        gridSellMargin.config = config;
        gridSellMargin.id= id;
        return gridSellMargin;
        case 'gridBuyMarginFixed':
        const gridBuyMarginFixed = new GridBuyMarginFixedStrategy(binanceService);
        gridBuyMarginFixed.symbol = symbol;
        gridBuyMarginFixed.config = config;
        gridBuyMarginFixed.id= id;
        return gridBuyMarginFixed;
      case 'gridSellMarginFixed':
        const gridSellMarginFixed = new GridSellMarginFixedStrategy(binanceService);
        gridSellMarginFixed.symbol = symbol;
        gridSellMarginFixed.config = config;
        gridSellMarginFixed.id= id;
        return gridSellMarginFixed;
      case 'rsi':
        const rsi = new RsiStrategy(binanceService);
        rsi.symbol = symbol;
        rsi.config = config;
        rsi.id =id;
        return rsi;
      case 'gridFull':
        const gridFull = new GridFullStrategy(binanceService);
        gridFull.symbol = symbol;
        gridFull.config = config;
        gridFull.id=id;
        return gridFull;
      default:
        throw new Error(`Estrategia desconocida: ${type}`);
    }
  }
}
