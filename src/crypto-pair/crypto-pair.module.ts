import { Module } from '@nestjs/common';
import { CryptoPairService } from './crypto-pair.service';
import { CryptoPairController } from './crypto-pair.controller';
import { PrismaModule } from 'prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CryptoPairController],
  providers: [CryptoPairService],
})
export class CryptoPairModule {}
