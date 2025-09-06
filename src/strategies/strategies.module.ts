import { Module } from "@nestjs/common";
import { GridBuyStrategy } from "./grid-buy.strategy";
import { RsiStrategy } from "./rsi.strategy";
import { PrismaClient } from "@prisma/client";

@Module({
  providers: [GridBuyStrategy, RsiStrategy,PrismaClient],
  exports: [GridBuyStrategy, RsiStrategy],
})
export class StrategiesModule {}
