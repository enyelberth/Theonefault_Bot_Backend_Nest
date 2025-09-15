import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsJSON, IsOptional, IsString } from 'class-validator';

export class UpdateTradingStrategyDto {
  @ApiPropertyOptional({ description: 'Símbolo del mercado' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: 'ID del tipo de estrategia' })
  @IsOptional()
  @IsInt()
  typeId?: number;

  @ApiPropertyOptional({ description: 'Configuración de la estrategia en JSON' })
  @IsOptional()
  @IsJSON()
  config?: any;
}
export class UpdateStrategyTypeDto {
  @ApiPropertyOptional({ description: 'Nombre del tipo de estrategia' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Descripción del tipo de estrategia' })
  @IsOptional()
  @IsString()
  description?: string;
}
