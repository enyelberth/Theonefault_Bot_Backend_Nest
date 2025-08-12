import { Module } from '@nestjs/common';
import { PruebaService } from './prueba.service';
import { PrismaClient } from '@prisma/client';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';

@Module({
  providers: [PruebaService, CryptoPriceService,PrismaClient],
})
export class PruebaModule {}
