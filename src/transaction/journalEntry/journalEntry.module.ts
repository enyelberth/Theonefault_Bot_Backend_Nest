
import { Module } from '@nestjs/common';
import { BinanceModule } from 'src/binance/binance.module';
import { TradingModule } from 'src/trading/trading.module';
import { PrismaModule } from 'prisma/prisma.module';
import { JournalEntryService } from './journalEntry.service';
import { JournalEntryController } from './journalEntry.controller';
import { RateLimitGuard } from 'src/security/rate-limit.guard';

@Module({
  imports: [PrismaModule, BinanceModule, TradingModule],
  controllers: [JournalEntryController],
  providers: [JournalEntryService, RateLimitGuard],
  exports: [JournalEntryService],
})
export class JournalEntryModule {}
