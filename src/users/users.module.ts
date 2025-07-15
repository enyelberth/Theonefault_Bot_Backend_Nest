// src/user/user.module.ts
import { Module } from '@nestjs/common';
//import { UserService } from './user.service';
import { UsersService } from './users.service';
//import { PrismaService } from '../prisma/prisma.service';
import { PrismaService } from 'prisma/prisma.service';
import { UsersController } from './users.controller';
@Module({
  providers: [UsersService, PrismaService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
