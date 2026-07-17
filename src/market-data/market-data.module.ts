import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { MarketDataService } from './market-data.service';
import { SymbolRegistryService } from './symbol-registry.service';
import { KlineCollectorService } from './kline-collector.service';
import { RetentionService } from './retention.service';
import { MarketDataController } from './market-data.controller';
import { BinanceService } from '../binance/binance.service';

@Module({
  controllers: [MarketDataController],
  providers: [
    PrismaClient,
    MarketDataService,
    SymbolRegistryService,
    KlineCollectorService,
    RetentionService,
    BinanceService,
  ],
  exports: [MarketDataService, SymbolRegistryService],
})
export class MarketDataModule {}
