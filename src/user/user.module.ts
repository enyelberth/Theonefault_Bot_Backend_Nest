import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [UserController],
  providers: [UserService,PrismaClient],
  exports: [UserService],
})
export class UserModule {}
