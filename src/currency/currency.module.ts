import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CurrencyController } from './currency.controller';
import { CurrencyService } from './currency.service';

@Module({
  controllers: [CurrencyController],
  providers: [CurrencyService, PrismaClient],
  exports: [CurrencyService],
})
export class CurrencyModule {}
