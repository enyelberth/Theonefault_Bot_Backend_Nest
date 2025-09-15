// trading-strategy.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsJSON, IsOptional, IsString } from 'class-validator';

export class CreateTradingStrategyDto {
  @ApiProperty({ description: 'Símbolo del mercado (ejemplo: BTCUSDT)' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'ID del tipo de estrategia' })
  @IsInt()
  typeId: number;

  @ApiProperty({ description: 'Configuración específica de la estrategia en formato JSON' })
  @IsJSON()
  config: any;

  @ApiPropertyOptional({ description: 'Tipo de estrategia (opcional)' })
  @IsOptional()
  @IsString()
  strategyType?: string|null;
}



export class CreateStrategyTypeDto {
  @ApiProperty({ description: 'Nombre único del tipo de estrategia' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Descripción del tipo de estrategia' })
  @IsOptional()
  @IsString()
  description?: string;
}

