
import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JournalEntryService } from './journalEntry.service';
import { JournalEntryController } from './journalEntry.controller';

@Module({
  controllers: [JournalEntryController],
  providers: [JournalEntryService, PrismaClient],
})
export class JournalEntryModule {}
