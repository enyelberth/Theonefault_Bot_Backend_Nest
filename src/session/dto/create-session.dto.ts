import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({ description: 'ID del usuario dueño de la sesión', example: 1 })
  @IsInt()
  userId: number;

  @ApiProperty({ description: 'Token único de la sesión' })
  @IsString()
  token: string;

  @ApiProperty({ description: 'Fecha de expiración en formato ISO' })
  @IsDateString()
  expiresAt: string;

  @ApiPropertyOptional({ description: 'User-Agent del cliente' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'IP del cliente' })
  @IsOptional()
  @IsString()
  ipAddress?: string;
}
