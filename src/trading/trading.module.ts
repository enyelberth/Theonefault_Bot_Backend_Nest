import { Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { PrismaClient } from '@prisma/client';
import { AccountService } from 'src/account/account.service';
import { RateLimitGuard } from 'src/security/rate-limit.guard';

@Module({
  exports: [TradingService],
  controllers: [TradingController],
  providers: [TradingService, AccountService, PrismaClient, RateLimitGuard],
})
export class TradingModule {}
