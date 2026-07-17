import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { BinanceModule } from "src/binance/binance.module";
import { BotService } from "./bot.service";
import { StrategyFactory } from "./strategy.factory";
import { RsiStrategy } from "src/strategies/rsi.strategy";
import { BinanceService } from "src/binance/binance.service";
import { BotController } from "./bot.controller";
import { StrategiesTradingModule } from "src/strategies-trading/strategies-trading.module";
import { BotPnlService } from "./bot-pnl.service";
import { IndicatorsModule } from "src/indicators/indicators.module";

@Module({
  exports: [BotService, BotPnlService],
  controllers: [BotController],
  imports: [BinanceModule, StrategiesTradingModule, IndicatorsModule],
  providers: [BotService, StrategyFactory, RsiStrategy, BinanceService, BotPnlService, PrismaClient],
})
export class BotModule {}