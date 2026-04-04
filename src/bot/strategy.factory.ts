import { BinanceService } from "src/binance/binance.service";
import { GridBuyStrategy } from "src/strategies/spot/grid-buy.strategy";
import { GridBuyMarginStrategy } from "src/strategies/margin/grid_buy_margin.strategy";
import { GridFullStrategy } from "src/strategies/margin/grid_full_strategy";
import { GridSellMarginFixedStrategy } from "src/strategies/margin/grid_sell_margin.fixed.strategy";
import { GridSellMarginStrategy } from "src/strategies/margin/grid_sell_margin.strategy";
import { EmaAdxTrendMarginStrategy } from "src/strategies/margin/ema-adx-trend-margin.strategy";
import { StochRsiScalperMarginStrategy } from "src/strategies/margin/stoch-rsi-scalper-margin.strategy";
import { EmaAdxTrendStrategy } from "src/strategies/spot/ema-adx-trend.strategy";
import { RsiStrategy } from "src/strategies/spot/rsi.strategy";
import { StochRsiScalperStrategy } from "src/strategies/spot/stoch-rsi-scalper.strategy";
import { TradingStrategy } from "src/strategies/trading-strategy.interface";
import {GridBuyMarginFixedStrategy} from "src/strategies/margin/grid_buy_margin_fixed.strategy"

export type StrategyType =
  | 'gridBuy'
  | 'gridBuyMargin'
  | 'gridSellMargin'
  | 'gridBuyMarginFixed'
  | 'gridSellMarginFixed'
  | 'rsi'
  | 'emaAdxTrend'
  | 'emaAdxTrendMargin'
  | 'stochRsiScalper'
  | 'stochRsiScalperMargin'
  | 'gridFull';

export class StrategyFactory {
  static createStrategy(type: string, binanceService: BinanceService,id:string ,symbol: string, config: unknown): TradingStrategy {
    const assignBase = (strategy: TradingStrategy): TradingStrategy => {
      strategy.symbol = symbol;
      strategy.config = config;
      strategy.id = id;
      return strategy;
    };

    switch (type) {
      case 'gridBuy':
        return assignBase(new GridBuyStrategy(binanceService));
      case 'gridBuyMargin':
        return assignBase(new GridBuyMarginStrategy(binanceService));
      case 'gridSellMargin':
        return assignBase(new GridSellMarginStrategy(binanceService));
        case 'gridBuyMarginFixed':
        return assignBase(new GridBuyMarginFixedStrategy(binanceService));
      case 'gridSellMarginFixed':
        return assignBase(new GridSellMarginFixedStrategy(binanceService));
      case 'rsi':
        return assignBase(new RsiStrategy(binanceService));
      case 'emaAdxTrend':
        return assignBase(new EmaAdxTrendStrategy(binanceService));
      case 'emaAdxTrendMargin':
        return assignBase(new EmaAdxTrendMarginStrategy(binanceService));
      case 'stochRsiScalper':
        return assignBase(new StochRsiScalperStrategy(binanceService));
      case 'stochRsiScalperMargin':
        return assignBase(new StochRsiScalperMarginStrategy(binanceService));
      case 'gridFull':
        return assignBase(new GridFullStrategy(binanceService));
      default:
        throw new Error(`Estrategia desconocida: ${type}`);
    }
  }
}
