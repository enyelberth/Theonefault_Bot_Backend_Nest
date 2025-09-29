import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification } from '@prisma/client';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';

@ApiTags('notification')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva notificación' })
  @ApiResponse({ status: 201, description: 'Notificación creada' })
  @ApiBody({ type: CreateNotificationDto })
  async create(@Body() createNotificationDto: CreateNotificationDto): Promise<Notification> {
    return await this.notificationService.create(createNotificationDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las notificaciones' })
  @ApiResponse({ status: 200, description: 'Lista de notificaciones' })
  async findAll(): Promise<Notification[]> {
    return await this.notificationService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener notificación por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Notificación encontrada' })
  async findOne(@Param('id') id: string): Promise<Notification> {
    return await this.notificationService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar notificación por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Notificación actualizada'})
  @ApiBody({ type: UpdateNotificationDto })
  async update(
    @Param('id') id: string,
    @Body() updateNotificationDto: UpdateNotificationDto
  ): Promise<Notification> {
    return await this.notificationService.update(+id, updateNotificationDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar notificación por ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, description: 'Notificación eliminada' })
  async remove(@Param('id') id: string): Promise<Notification> {
    return await this.notificationService.remove(+id);
  }
}
