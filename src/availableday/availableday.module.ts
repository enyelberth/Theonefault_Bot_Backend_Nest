import { Module } from '@nestjs/common';
import { AvailabledayController } from './availableday.controller';
import { AvailabledayService } from './availableday.service';
import { PrismaService } from 'prisma/prisma.service';

@Module({
    controllers: [AvailabledayController],
    providers: [AvailabledayService, PrismaService],
})
export class AvailabledayModule {}
