import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [ClientsController], // Debe estar aquí
  providers: [ClientsService, PrismaService],
  exports: [ClientsService],
})
export class ClientsModule {}
