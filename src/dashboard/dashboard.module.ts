import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DashboardGateway } from './dashboard.gateway';

@Module({
  controllers: [DashboardController],
  providers: [PrismaClient, DashboardService, DashboardGateway],
  exports: [DashboardService],
})
export class DashboardModule {}
