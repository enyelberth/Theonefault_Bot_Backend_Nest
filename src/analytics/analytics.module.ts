import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CryptoPriceModule } from '../crypto-price/crypto-price.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [CryptoPriceModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PrismaClient],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
