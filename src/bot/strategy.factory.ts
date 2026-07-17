import { BinanceService } from "src/binance/binance.service";
import { GridBuyStrategy } from "src/strategies/grid-buy.strategy";
import { GridBuyMarginStrategy } from "src/strategies/grid_buy_margin.strategy";
import { GridFullStrategy } from "src/strategies/grid_full_strategy";
import { GridSellMarginFixedStrategy } from "src/strategies/grid_sell_margin.fixed.strategy";
import { GridSellMarginStrategy } from "src/strategies/grid_sell_margin.strategy";
import { RsiStrategy } from "src/strategies/rsi.strategy";
import { TradingStrategy } from "src/strategies/trading-strategy.interface";
import { GridBuyMarginFixedStrategy } from "src/strategies/grid_buy_margin_fixed.strategy"
import { BollingerRsiStrategy } from "src/strategies/bollinger-rsi.strategy";
import { AdaptiveGridStrategy } from "src/strategies/adaptive-grid.strategy";
import { IndicatorsService } from "src/indicators/indicators.service";

export class StrategyFactory {
  static createStrategy(
    type: string,
    binanceService: BinanceService,
    id: string,
    symbol: string,
    config: any,
    deps?: { indicators?: IndicatorsService },
  ): TradingStrategy {
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
      case 'bollingerRsi':
        if (!deps?.indicators) {
          throw new Error('bollingerRsi requires IndicatorsService');
        }
        const bbRsi = new BollingerRsiStrategy(binanceService, deps.indicators);
        bbRsi.symbol = symbol;
        bbRsi.config = config;
        bbRsi.id = id;
        return bbRsi;
      case 'adaptiveGrid':
        if (!deps?.indicators) {
          throw new Error('adaptiveGrid requires IndicatorsService');
        }
        const adaptive = new AdaptiveGridStrategy(binanceService, deps.indicators);
        adaptive.symbol = symbol;
        adaptive.config = config;
        adaptive.id = id;
        return adaptive;
      default:
        throw new Error(`Estrategia desconocida: ${type}`);
    }
  }
}
