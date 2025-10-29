import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsDateString, IsString } from 'class-validator';

export enum UpDown {
  up = 'up',
  down = 'down',
}

export class CreateAlertDto {
  @ApiProperty({ example: 'BTCUSDT', description: '[translate:Símbolo del activo]' })
  @IsNotEmpty()
  @IsString()
  symbol: string;

  @ApiProperty({ example: 30000, description: '[translate:Precio objetivo para la alerta]' })
  @IsNotEmpty()
  @IsNumber()
  price: number;

  @ApiProperty({ enum: UpDown, description: '[translate:Condición: arriba o abajo]' })
  @IsEnum(UpDown)
  up_down: UpDown;

  @ApiPropertyOptional({ example: 5000, description: '[translate:Volumen negociado opcional]' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  volume?: number;

  @ApiProperty({ example: '2025-10-26T15:00:00Z', description: '[translate:Momento del registro del precio]' })
  @IsNotEmpty()
  @IsDateString()
  timestamp: string; // fecha en formato ISO8601 para JSON
}

export class UpdateAlertDto {
  @ApiPropertyOptional({ example: 'BTCUSDT', description: '[translate:Símbolo del activo]' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ example: 30000, description: '[translate:Precio objetivo para la alerta]' })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ enum: UpDown, description: '[translate:Condición: arriba o abajo]' })
  @IsOptional()
  @IsEnum(UpDown)
  up_down?: UpDown;

  @ApiPropertyOptional({ example: 5000, description: '[translate:Volumen negociado opcional]' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  volume?: number;

  @ApiPropertyOptional({ example: '2025-10-26T15:00:00Z', description: '[translate:Momento del registro del precio]' })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}
