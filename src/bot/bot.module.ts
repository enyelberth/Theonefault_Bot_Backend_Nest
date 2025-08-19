import { Module } from "@nestjs/common";
import { BinanceModule } from "src/binance/binance.module";
import { BotService } from "./bot.service";
import { StrategyFactory } from "./strategy.factory";
import { RsiStrategy } from "src/strategies/rsi.strategy";
import { BinanceService } from "src/binance/binance.service";
import { BotController } from "./bot.controller";

@Module({
  controllers: [BotController],
  imports: [BinanceModule],
  providers: [BotService,StrategyFactory,RsiStrategy,BinanceService]
})
export class BotModule {}