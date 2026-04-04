import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  exports: [NotificationService],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
