import { Module } from '@nestjs/common';
import { BinanceService } from './binance.service';
import { BinanceAuthService } from './binance-auth.service';
import { BinanceAccountService } from './binance-account.service';
import { BinanceSpotService } from './binance-spot.service';
import { BinanceMarginService } from './binance-margin.service';
import { BinanceController } from './binance.controller';
import { StrategyMonitoringModule } from '../strategy-monitoring/strategy-monitoring.module';

@Module({
  imports: [StrategyMonitoringModule],
  exports: [
    BinanceService,
    BinanceAuthService,
    BinanceAccountService,
    BinanceSpotService,
    BinanceMarginService,
  ],
  controllers: [BinanceController],
  providers: [
    BinanceAuthService,
    BinanceAccountService,
    BinanceSpotService,
    BinanceMarginService,
    BinanceService,
  ],
})
export class BinanceModule {}
