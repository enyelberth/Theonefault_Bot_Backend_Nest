import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MarketRegimeController } from './market-regime.controller';
import { MarketRegimeService } from './market-regime.service';

@Module({
  controllers: [MarketRegimeController],
  providers: [MarketRegimeService, PrismaClient],
  exports: [MarketRegimeService],
})
export class MarketRegimeModule {}
