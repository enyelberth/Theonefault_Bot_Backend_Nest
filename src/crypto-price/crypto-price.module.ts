import { Module } from '@nestjs/common';
import { CryptoPriceService } from './crypto-price.service';
import { CryptoPriceController } from './crypto-price.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [CryptoPriceController],
  providers: [CryptoPriceService, PrismaClient],
  exports: [CryptoPriceService], // Export the service if needed in other modules

})
export class CryptoPriceModule {}
