import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService, PrismaClient],
  exports: [ProfileService],
})
export class ProfileModule {}
