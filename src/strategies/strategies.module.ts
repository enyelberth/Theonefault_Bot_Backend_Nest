import { Module } from "@nestjs/common";
import { GridBuyStrategy } from "./grid-buy.strategy";
import { RsiStrategy } from "./rsi.strategy";
import { PrismaClient } from "@prisma/client";
import { GridFullStrategy } from "./grid_full_strategy";
import {GridBuyMarginFixedStrategy} from "./grid_buy_margin_fixed.strategy"

@Module({
  providers: [GridBuyStrategy,GridBuyMarginFixedStrategy, GridFullStrategy,RsiStrategy,PrismaClient],
  exports: [GridBuyStrategy,GridBuyMarginFixedStrategy ,GridFullStrategy,RsiStrategy],
})
export class StrategiesModule {}
