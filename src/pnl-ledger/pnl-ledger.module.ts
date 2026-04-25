import { Module } from '@nestjs/common';
import { PnlLedgerService } from './pnl-ledger.service';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PnlLedgerService],
  exports: [PnlLedgerService],
})
export class PnlLedgerModule {}
