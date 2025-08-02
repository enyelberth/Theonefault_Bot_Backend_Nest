import { Module } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { PrismaClient } from '@prisma/client';
import { ServiceService } from '../service/service.service'

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService, ServiceService ,PrismaClient],
})
export class PromotionsModule {}
