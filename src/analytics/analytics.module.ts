import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PnlLedgerModule } from '../pnl-ledger/pnl-ledger.module';

@Module({
  imports: [PnlLedgerModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
