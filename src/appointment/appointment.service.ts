import { Injectable } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateAppointmentDto } from './dto/createAppointment.dto';
@Injectable()
export class AppointmentService {
    constructor(private prisma: PrismaService) {}
    async findAll(){
        return this.prisma.appointment.findMany();
    }
    async create(data: CreateAppointmentDto) : Promise<any> {



        return this.prisma.appointment.create({ data: {
            createdAt: new Date(),
            date: new Date(),
            notes: data.notes,
            scheduleId: 1,
            userId: 2,
            status: 'PENDING',
            clientId:data.clientId,
            promotionId:data.promotionId

             // Asignar un estado por defecto si no
        } });
        // Lógica para crear una cita
    }
    async verifyDate(){

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
