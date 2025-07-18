import { Body, Controller, Get, Post } from '@nestjs/common';
import { AvailabledayService } from './availableday.service';
import { Availableday } from './entity/availableday.entity';
import { Public } from 'src/auth/auth.guard';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('availableday')
export class AvailabledayController {
    constructor(private readonly availabledayService: AvailabledayService) {

    }
    @Public()
    @Get()
    async findAll() {
        return this.availabledayService.findAll();
    }
    @Public()
    @Post()
    @ApiOperation({ summary: 'Crear un nuevo cronograma' })
    @ApiResponse({ status: 201, description: 'Cronograma creado correctamente.', type: Availableday })
    @ApiResponse({ status: 400, description: 'Datos inválidos.' })
    async create(@Body()data: Availableday) {
        return this.availabledayService.create(data);
    }
}
