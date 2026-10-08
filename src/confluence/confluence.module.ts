import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketRegimeModule } from '../market-regime/market-regime.module';
import { IndicatorsModule } from '../indicators/indicators.module';
import { ConfluenceService } from './confluence.service';
import { ConfluenceController } from './confluence.controller';

@Module({
  imports: [MarketDataModule, MarketRegimeModule, IndicatorsModule],
  controllers: [ConfluenceController],
  providers: [ConfluenceService, PrismaClient],
  exports: [ConfluenceService],
})
export class ConfluenceModule {}
