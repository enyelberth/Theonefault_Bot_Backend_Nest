import { Module } from "@nestjs/common";
import { GridBuyStrategy } from "./grid-buy.strategy";
import { RsiStrategy } from "./rsi.strategy";

@Module({
  providers: [GridBuyStrategy, RsiStrategy],
  exports: [GridBuyStrategy, RsiStrategy],
})
export class StrategiesModule {}
