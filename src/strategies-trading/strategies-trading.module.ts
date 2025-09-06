import { Module } from '@nestjs/common';
import { StrategiesTradingService } from './strategies-trading.service';
import { StrategiesTradingController } from './strategies-trading.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [StrategiesTradingController],
  providers: [StrategiesTradingService, PrismaClient],
})
export class StrategiesTradingModule {}
