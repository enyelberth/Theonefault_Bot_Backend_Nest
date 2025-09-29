// create-notification.dto.ts
import { IsInt, IsString, IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty({ description: 'ID del usuario al que pertenece la notificación', example: 123 })
  @IsInt()
  userId: number;

  @ApiProperty({ description: 'Título de la notificación', example: 'Nueva tarea asignada' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Mensaje o contenido de la notificación', example: 'Tienes una nueva tarea pendiente para hoy' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Indica si la notificación ha sido leída', example: false, default: false })
  @IsBoolean()
  @IsOptional()
  read?: boolean; // Opcional al crear, por defecto false
}
