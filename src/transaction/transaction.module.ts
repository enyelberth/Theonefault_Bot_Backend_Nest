import { Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [TransactionController],
  providers: [TransactionService, PrismaClient],
})
export class TransactionModule {}
