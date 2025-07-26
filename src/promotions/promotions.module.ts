import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService, PrismaClient],
})
export class PromotionsModule {}
