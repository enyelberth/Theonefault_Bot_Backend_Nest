import { Injectable } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { timeStamp } from 'console';
import { promises } from 'dns';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class AppointmentService {
    constructor(private prisma: PrismaService) {}
    async findAll(){
        return this.prisma.appointment.findMany();
    }
    async create(data: Appointment):Promise<any> {
        return this.prisma.appointment.create({ data: {
            createdAt: new Date(),
            date: timeStamp(),
            notes: data.notes,
            scheduleId: data.scheduleId,
            userId: data.userId,
            status: data.status || 'PENDING', // Asignar un estado por defecto si no
        } });
        // Lógica para crear una cita
    }

    async getAppointment(id: string) {
        // Lógica para obtener una cita por ID
    }

    async updateAppointment(id: string, data: any) {
        // Lógica para actualizar una cita por ID
    }

    async deleteAppointment(id: string) {
        // Lógica para eliminar una cita por ID
    }
}
