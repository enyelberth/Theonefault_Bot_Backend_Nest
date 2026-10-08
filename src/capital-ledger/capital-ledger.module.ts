import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BinanceModule } from '../binance/binance.module';
import { CapitalLedgerController } from './capital-ledger.controller';
import { CapitalLedgerService } from './capital-ledger.service';
import { WalletSyncService } from './wallet-sync.service';

@Module({
  imports: [BinanceModule],
  controllers: [CapitalLedgerController],
  providers: [CapitalLedgerService, WalletSyncService, PrismaClient],
  exports: [CapitalLedgerService],
})
export class CapitalLedgerModule {}
