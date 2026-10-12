import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PriceForecastController } from './price-forecast.controller';
import { PriceForecastService } from './price-forecast.service';

@Module({
  controllers: [PriceForecastController],
  providers: [PriceForecastService, PrismaClient],
  exports: [PriceForecastService],
})
export class MarketPredictionModule {}
