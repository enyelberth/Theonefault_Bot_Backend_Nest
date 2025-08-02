import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppointmentService } from './appointment.service';
import { Public } from 'src/auth/auth.guard';
import { Appointment } from './entity/appointment.entity';
import {CreateAppointmentDto} from './dto/createAppointment.dto'
@ApiTags('appointment')
@Controller('appointment')
export class AppointmentController {
    constructor(private readonly appointmentService: AppointmentService) {

    }
    @Public()
    @Get()
    async findAll():Promise<any> {
        return await this.appointmentService.findAll();
    }
    @Public()
    @Post()
    @ApiOperation({ summary: 'Crear un nuevo cronograma' })
    @ApiResponse({ status: 201, description: 'Cronograma creado correctamente.', type: Appointment })
    @ApiResponse({ status: 400, description: 'Datos inválidos.' })
    async create(@Body() createAppointmentDto: CreateAppointmentDto):Promise<any> {
        return this.appointmentService.create(createAppointmentDto);
    }

}
