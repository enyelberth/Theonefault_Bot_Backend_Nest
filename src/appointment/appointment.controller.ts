import { Body, Controller, Get, Post, Patch, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppointmentService } from './appointment.service';
import { Public } from 'src/auth/auth.guard';
import { Appointment } from './entity/appointment.entity';
import { CreateAppointmentDto } from './dto/createAppointment.dto';
import { CreateAppointmentWithClientDto } from './dto/createAppointmentWithClient.dto';
import { UpdateAppointmentStatusDto } from './dto/updateAppointmentStatus.dto';

@ApiTags('appointment')
@Controller('appointment')
export class AppointmentController {
    constructor(private readonly appointmentService: AppointmentService) {}

    @Public()
    @Get()
    @ApiOperation({ summary: 'Obtener todas las citas' })
    @ApiResponse({ status: 200, description: 'Lista de citas', type: [Appointment] })
    async findAll(): Promise<any> {
        return await this.appointmentService.findAll();
    }

    @Public()
    @Get('upcoming')
    @ApiOperation({ summary: 'Obtener citas no vencidas' })
    @ApiResponse({ status: 200, description: 'Lista de citas no vencidas', type: [Appointment] })
    async getUpcomingAppointments(): Promise<any> {
        return await this.appointmentService.getUpcomingAppointments();
    }

    @Public()
    @Get('past')
    @ApiOperation({ summary: 'Obtener citas vencidas' })
    @ApiResponse({ status: 200, description: 'Lista de citas vencidas', type: [Appointment] })
    async getPastAppointments(): Promise<any> {
        return await this.appointmentService.getPastAppointments();
    }

    @Public()
    @Post()
    @ApiOperation({ summary: 'Crear una nueva cita' })
    @ApiResponse({ status: 201, description: 'Cita creada correctamente.', type: Appointment })
    @ApiResponse({ status: 400, description: 'Datos inválidos.' })
    async create(@Body() createAppointmentDto: CreateAppointmentDto): Promise<any> {
        return this.appointmentService.create(createAppointmentDto);
    }

    @Public()
    @Post('with-client')
    @ApiOperation({ summary: 'Crear una cita y registrar cliente si no existe' })
    @ApiResponse({ status: 201, description: 'Cita y cliente creados correctamente.', type: Appointment })
    @ApiResponse({ status: 400, description: 'Datos inválidos.' })
    async createWithClient(@Body() body: CreateAppointmentWithClientDto): Promise<any> {
        if (!body.client) {
            // Si no se envían datos de cliente, solo crea la cita
            return this.appointmentService.create(body.appointment);
        }
        // Si se envían datos de cliente, crea cliente y cita
        return this.appointmentService.createWithClient(body.client, body.appointment);
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Actualizar el status de una cita' })
    @ApiResponse({ status: 200, description: 'Status actualizado correctamente.' })
    @ApiResponse({ status: 404, description: 'Cita no encontrada.' })
    async updateStatus(
        @Param('id') id: string,
        @Body() body: UpdateAppointmentStatusDto
    ) {
        return this.appointmentService.updateStatus(Number(id), body.status);
    }
}
