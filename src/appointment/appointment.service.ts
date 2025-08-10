import { Injectable, BadRequestException, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Appointment } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { CreateAppointmentDto } from './dto/createAppointment.dto';
import { AppointmentStatus } from './appointment-status.enum';
import { ClientsService } from 'src/clients/clients.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateClientDto } from 'src/clients/dto/create-client.dto'; // Ajusta la ruta si es necesario

@Injectable()
export class AppointmentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly moduleClient: ClientsService
    ) {}

    async findAll() {
        return this.prisma.appointment.findMany();
    }

    // Obtener citas no vencidas
    async getUpcomingAppointments() {
        const now = new Date();
        return this.prisma.appointment.findMany({
            where: {
                date: {
                    gte: now,
                },
            },
        });
    }

    // Obtener citas vencidas
    async getPastAppointments() {
        const now = new Date();
        return this.prisma.appointment.findMany({
            where: {
                date: {
                    lt: now,
                },
            },
        });
    }

    // Crear cita validando que no choque con otra
    async create(data: CreateAppointmentDto): Promise<any> {
        try {
            // Validar el status antes de continuar
            if (
                data.status &&
                !Object.values(AppointmentStatus).includes(data.status as AppointmentStatus)
            ) {
                throw new BadRequestException(
                    `El status '${data.status}' no es válido. Los valores permitidos son: ${Object.values(AppointmentStatus).join(', ')}`
                );
            }

            // Verifica si el cliente existe
            const client = await this.prisma.clients.findUnique({
                where: { id: data.clientId },
            });
            if (!client) {
                throw new NotFoundException('El cliente no está registrado.');
            }

            // Verifica si la promoción existe (si se envía)
            if (data.promotionId) {
                const promotion = await this.prisma.promotions.findUnique({
                    where: { id: data.promotionId },
                });
                if (!promotion) {
                    throw new NotFoundException('La promoción no existe.');
                }
            }

            if (data.userId) {
                const user = await this.prisma.user.findUnique({ where: { id: Number(data.userId) } });
                if (!user) {
                    throw new NotFoundException('El usuario no existe.');
                }
            } else {
                throw new BadRequestException('El campo userId es obligatorio.');
            }

            // Validar que la hora esté entre 0 y 23 (por si acaso)
            if (typeof data.hora !== 'number' || data.hora < 0 || data.hora > 23) {
                throw new BadRequestException('La hora debe ser un número entre 0 y 23.');
            }

            // Construir la fecha con la hora recibida
            const fecha = new Date(data.date ? data.date : new Date());
            fecha.setHours(data.hora, 0, 0, 0);

            return await this.prisma.appointment.create({
                data: {
                    createdAt: new Date(),
                    date: fecha,
                    notes: data.notes,
                    scheduleId: data.scheduleId || 1,
                    userId: data.userId || 2,
                    status: data.status, // Ya validado
                    clientId: data.clientId,
                    hora: data.hora,
                    promotionId: data.promotionId,
                },
            });
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            throw new InternalServerErrorException('Error al crear la cita: ' + error.message);
        }
    }

    async createWithClient(clientData: any, appointmentData: CreateAppointmentDto): Promise<any> {
        try {
            // Validar los datos del cliente usando su DTO
            const clientDto = plainToInstance(CreateClientDto, clientData);
            const errors = await validate(clientDto);
            if (errors.length > 0) {
                throw new BadRequestException('Datos del cliente no válidos: ' + JSON.stringify(errors));
            }

            // Verificar si el cliente ya existe (por ejemplo, por email o documento)
            const existingClient = await this.prisma.clients.findFirst({
                where: {
                    email: clientData.email, // Cambia por el campo único de tu modelo
                },
            });
            if (existingClient) {
                throw new BadRequestException('El cliente ya está registrado.');
            }

            // Crear el cliente directamente con Prisma
            const newClient = await this.prisma.clients.create({
                data: clientData,
            });

            // Crear la cita con el id del nuevo cliente
            return await this.create({ ...appointmentData, clientId: newClient.id });
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }
            throw new InternalServerErrorException('Error al registrar cliente y crear cita: ' + error.message);
        }
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

    async updateStatus(id: number, status: AppointmentStatus): Promise<any> {
        const appointment = await this.prisma.appointment.findUnique({ where: { id } });
        if (!appointment) {
            throw new NotFoundException('La cita no existe.');
        }
        return this.prisma.appointment.update({
            where: { id },
            data: { status },
        });
    }
}
