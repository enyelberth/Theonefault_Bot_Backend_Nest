import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';

@Module({
  controllers: [AlertController],
  providers: [AlertService, PrismaClient],
  exports: [AlertService],
})
export class AlertModule {}
