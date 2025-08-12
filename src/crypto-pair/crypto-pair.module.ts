import { Module } from '@nestjs/common';
import { CryptoPairService } from './crypto-pair.service';
import { CryptoPairController } from './crypto-pair.controller';
import { PrismaClient } from '@prisma/client';

@Module({
  controllers: [CryptoPairController],
  providers: [CryptoPairService, PrismaClient],
})
export class CryptoPairModule {}
