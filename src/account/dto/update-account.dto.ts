import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, IsInt } from 'class-validator';

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 1, description: 'ID del usuario propietario de la cuenta' })
  @IsOptional()
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({ example: 'usuario@example.com', description: 'Email único de la cuenta' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+34123456789', description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'miPasswordNuevo123', description: 'Contraseña actualizada de la cuenta' })
  @IsOptional()
  @IsString()
  @Length(6, 128)
  password?: string;

  @ApiPropertyOptional({ example: 'newapikey123', description: 'Clave API actualizada' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ example: 'newsecret456', description: 'Secreto asociado a la API actualizado' })
  @IsOptional()
  @IsString()
  apiSecret?: string;
}
