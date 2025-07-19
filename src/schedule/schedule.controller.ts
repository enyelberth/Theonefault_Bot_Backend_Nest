import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Schedule } from './entity/schedule.entity';
import { CreateScheduleDto } from './dto/createSchedule.dto';
import { AuthGuard, Public } from 'src/auth/auth.guard';
@ApiTags('schedule')
@Controller('schedule')
export class ScheduleController {
    constructor(private readonly scheduleService: ScheduleService) {

    }
    @ApiBearerAuth('BearerAuth') // El nombre debe coincidir con el del DocumentBuilder
    @UseGuards(AuthGuard)
    @Public()

    @Get()
    @ApiOperation({ summary: 'Obtener el cronograma' })
    @ApiResponse({ status: 200, description: 'Lista de cronogramas obtenidos correctamente.', type: [Schedule] })
    @ApiResponse({ status: 404, description: 'Cronogramas no encontrados.' })
    async findAll() {
        return this.scheduleService.findAll();
    }
    @Public()
    @Post()
    @ApiOperation({ summary: 'Crear un nuevo cronograma' })
    @ApiResponse({ status: 201, description: 'Cronograma creado correctamente.', type: Schedule })
    @ApiResponse({ status: 400, description: 'Datos inválidos.' })
    async create(@Body() schedule: Schedule) {
        return this.scheduleService.create(schedule);
    }
}
