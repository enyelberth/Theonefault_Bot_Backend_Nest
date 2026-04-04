import { Module } from "@nestjs/common";
import { GridBuyStrategy } from "./spot/grid-buy.strategy";
import { RsiStrategy } from "./spot/rsi.strategy";
import { PrismaClient } from "@prisma/client";
import { GridFullStrategy } from "./margin/grid_full_strategy";
import {GridBuyMarginFixedStrategy} from "./margin/grid_buy_margin_fixed.strategy"

@Module({
  providers: [GridBuyStrategy,GridBuyMarginFixedStrategy, GridFullStrategy,RsiStrategy,PrismaClient],
  exports: [GridBuyStrategy,GridBuyMarginFixedStrategy ,GridFullStrategy,RsiStrategy],
})
export class StrategiesModule {}
