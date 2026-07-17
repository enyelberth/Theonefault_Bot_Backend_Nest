import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  controllers: [SessionController],
  providers: [SessionService, PrismaClient],
  exports: [SessionService],
})
export class SessionModule {}
