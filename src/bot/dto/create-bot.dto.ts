import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderLevelDto {
  @ApiProperty({ description: 'Identificador del nivel', example: 1 })
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty({ description: 'Precio del nivel', example: 1.9 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ description: 'Cantidad del nivel', example: 3 })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class BotConfigDto {
  @ApiPropertyOptional({ description: 'Cantidad de cuadrícula', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  gridCount?: number;

  @ApiPropertyOptional({ description: 'Precio inferior del rango', example: 25000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  lowerPrice?: number;

  @ApiPropertyOptional({ description: 'Precio superior del rango', example: 30000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  upperPrice?: number;

  @ApiPropertyOptional({ description: 'Cantidad total a negociar', example: 1.5 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  totalQuantity?: number;

  @ApiProperty({ description: 'Margen de beneficio esperado', example: 0.0018 })
  @IsNumber()
  @Min(0)
  profitMargin: number;

  @ApiPropertyOptional({ description: 'Máximo tiempo permitido para que una orden esté abierta en milisegundos', example: 3600000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOrderAgeMs?: number;

  @ApiPropertyOptional({ description: 'Niveles de órdenes para estrategias fijas', type: [OrderLevelDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLevelDto)
  ordersLevels?: OrderLevelDto[];

  @ApiPropertyOptional({ description: 'Configuración libre adicional de estrategia' })
  @IsOptional()
  @IsObject()
  additional?: Record<string, unknown>;
}

export class StartBotDto {
  @ApiProperty({ description: 'Identificador único de estrategia', example: 'er10' })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({ description: 'Tipo numérico de estrategia', example: 1 })
  @IsInt()
  @Min(1)
  typeId: number;

  @ApiProperty({ description: 'Símbolo de la criptomoneda', example: 'BTCUSDT' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiProperty({ description: 'Tipo de estrategia', example: 'gridBuyMarginFixed' })
  @IsString()
  @IsNotEmpty()
  strategyType: string;

  @ApiProperty({ description: 'Configuración específica de la estrategia', type: BotConfigDto })
  @ValidateNested()
  @Type(() => BotConfigDto)
  config: BotConfigDto;
}

export class UpdateProfitMarginDto {
  @ApiProperty({ description: 'Nuevo profit margin', example: 0.001 })
  @IsNumber()
  @Min(0)
  profitMargin: number;
}

export class UpdateOrderLevelPriceDto {
  @ApiProperty({ description: 'Nuevo precio del nivel', example: 1.92 })
  @IsNumber()
  @IsPositive()
  newPrice: number;
}
