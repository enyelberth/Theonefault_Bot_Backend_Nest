import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 1, description: 'ID del usuario propietario de la cuenta' })
  userId: number;

  @ApiProperty({ example: 'usuario@example.com', description: 'Email único de la cuenta' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+34123456789', description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'miPasswordSeguro123', description: 'Contraseña de la cuenta' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 128)
  password: string;

  @ApiProperty({ example: 'apikey123', description: 'Clave API única' })
  @IsNotEmpty()
  @IsString()
  apiKey: string;

  @ApiProperty({ example: 'secret456', description: 'Secreto asociado a la API' })
  @IsNotEmpty()
  @IsString()
  apiSecret: string;
}
