import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [AccountController],
  providers: [AccountService, PrismaClient],
  exports: [AccountService],
})
export class AccountModule {}
