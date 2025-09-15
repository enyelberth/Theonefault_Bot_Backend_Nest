import { Module } from "@nestjs/common";
import { GridBuyStrategy } from "./grid-buy.strategy";
import { RsiStrategy } from "./rsi.strategy";
import { PrismaClient } from "@prisma/client";
import { GridFullStrategy } from "./grid_full_strategy";

@Module({
  providers: [GridBuyStrategy, GridFullStrategy,RsiStrategy,PrismaClient],
  exports: [GridBuyStrategy, GridFullStrategy,RsiStrategy],
})
export class StrategiesModule {}
