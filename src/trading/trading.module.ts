import { Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { PrismaClient } from '@prisma/client';
import { AccountService } from 'src/account/account.service';

@Module({
  exports: [TradingService],
  controllers: [TradingController],
  providers: [TradingService, AccountService, PrismaClient],
})
export class TradingModule {}
