import { Module } from '@nestjs/common';
import { BinanceModule } from 'src/binance/binance.module';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { StrategiesTradingModule } from 'src/strategies-trading/strategies-trading.module';

@Module({
  exports: [BotService],
  controllers: [BotController],
  imports: [BinanceModule, StrategiesTradingModule],
  providers: [BotService],
})
export class BotModule {}
