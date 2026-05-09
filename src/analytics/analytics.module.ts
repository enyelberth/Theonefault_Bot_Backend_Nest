import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PnlLedgerModule } from '../pnl-ledger/pnl-ledger.module';
import { StrategiesTradingModule } from '../strategies-trading/strategies-trading.module';

@Module({
  imports: [PnlLedgerModule, StrategiesTradingModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
