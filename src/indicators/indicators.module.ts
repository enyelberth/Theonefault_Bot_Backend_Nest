import { Module } from '@nestjs/common';
import { IndicatorsService } from './indicators.service';
import { IndicatorsController } from './indicators.controller';
import { PrismaClient } from '@prisma/client';
import { MarketDataModule } from 'src/market-data/market-data.module';
import { IndicatorCacheService } from './indicator-cache.service';

@Module({
  imports: [MarketDataModule],
  controllers: [IndicatorsController],
  providers: [IndicatorsService, IndicatorCacheService, PrismaClient],
  exports: [IndicatorsService, IndicatorCacheService],
})
export class IndicatorsModule {}
