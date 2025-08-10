import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { PrismaService } from 'prisma/prisma.service';
import { ClientsModule } from '../clients/clients.module'; // Ajusta la ruta si es necesario

@Module({
  imports: [ClientsModule], // Importa el módulo de clientes
  controllers: [AppointmentController],
  providers: [AppointmentService, PrismaService],
})
export class AppointmentModule {}
