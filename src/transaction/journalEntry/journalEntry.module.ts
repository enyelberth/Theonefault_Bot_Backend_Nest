
import { Module } from '@nestjs/common';
import { BinanceModule } from 'src/binance/binance.module';
import { TradingModule } from 'src/trading/trading.module';
import { PrismaModule } from 'prisma/prisma.module';
import { JournalEntryService } from './journalEntry.service';
import { JournalEntryController } from './journalEntry.controller';

@Module({
  imports: [PrismaModule, BinanceModule, TradingModule],
  controllers: [JournalEntryController],
  providers: [JournalEntryService],
  exports: [JournalEntryService],
})
export class JournalEntryModule {}
