// strategies/trading-strategy.interface.ts
export interface TradingStrategy {
  symbol: string;
  config: {
    //Cantidad de Grid
    gridCount: number;
    //Precio mas bajo
    lowerPrice?: number;
    //Precio mas alto
    upperPrice?: number;
    //Cantidad total
    totalQuantity: number;
    //Margen de beneficio
    profitMargin: number;
    //Edad máxima de la orden  
    maxOrderAgeMs?: number;
  };

  run(): Promise<void>;
  stop?(): Promise<void>;
}
