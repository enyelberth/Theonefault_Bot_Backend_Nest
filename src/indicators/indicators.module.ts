import { Module } from '@nestjs/common';
import { IndicatorsService } from './indicators.service';
import { IndicatorsController } from './indicators.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [IndicatorsController],
  providers: [IndicatorsService, PrismaClient],
  exports: [IndicatorsService],
})
export class IndicatorsModule {}
