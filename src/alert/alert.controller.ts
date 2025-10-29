import { 
  ApiBearerAuth, 
  ApiOperation, 
  ApiQuery, 
  ApiResponse, 
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { AlertService } from './alert.service';
import { Controller, Get, Post, Put, Delete, Query, Param, Body, UseGuards, ParseIntPipe } from '@nestjs/common';
import { AuthGuard } from 'src/authA/auth.guard';
import { CreateAlertDto } from './dto/create-alert.dto';

export enum UpDown {
  up = 'up',
  down = 'down',
}

export interface Alert {
  id?: number;                // ID autoincremental
  symbol: string;             // Símbolo del activo ejemplo "BTCUSDT"
  price: number;              // Precio objetivo para la alerta
  up_down: UpDown;            // Condición: 'up' (arriba) o 'down' (abajo)
  volume?: number;            // Volumen negociado opcional
  timestamp?: Date;           // Momento del registro del precio
  createdAt?: Date;           // Momento en que se creó la alerta
}

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('alerts')
@Controller('alert')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get()
  @ApiOperation({ summary: '[translate:Obtener la lista de todas las alertas o buscar por email]' })
  @ApiResponse({ status: 200, description: '[translate:Lista de alertas obtenida correctamente.]' })
  @ApiQuery({ name: 'email', required: false, description: '[translate:Email para buscar una alerta específica]' })
  async findAllOrByEmail(@Query('email') email?: string) {
    if (email) {
      // Descomenta e implementa findByEmail en el servicio si quieres esta funcionalidad
      // return this.alertService.findByEmail(email);
      throw new Error('[translate:Método findByEmail no implementado]');
    }
    return this.alertService.getAlerts();
  }

  @Get(':id')
  @ApiOperation({ summary: '[translate:Obtener una alerta por ID]' })
  @ApiResponse({ status: 200, description: '[translate:Alerta obtenida correctamente.]' })
  @ApiResponse({ status: 404, description: '[translate:Alerta no encontrada.]' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.alertService.getOneAlert(id);
  }

  @Post()
  @ApiOperation({ summary: '[translate:Crear una nueva alerta]' })
  @ApiCreatedResponse({ description: '[translate:Alerta creada correctamente.]' })
  @ApiResponse({ status: 201, description: '[translate:Alerta creada correctamente.]', type: CreateAlertDto })
  async create(@Body() alert: CreateAlertDto) {
    return this.alertService.createAlert(alert);
  }

  @Put(':id')
  @ApiOperation({ summary: '[translate:Actualizar una alerta existente]' })
  @ApiResponse({ status: 200, description: '[translate:Alerta actualizada correctamente.]' })
  @ApiResponse({ status: 404, description: '[translate:Alerta no encontrada.]' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() alert: Alert) {
    return this.alertService.updateAlert(id, alert);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[translate:Eliminar una alerta]' })
  @ApiResponse({ status: 200, description: '[translate:Alerta eliminada correctamente.]' })
  @ApiResponse({ status: 404, description: '[translate:Alerta no encontrada.]' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.alertService.deleteAlert(id);
  }
}
