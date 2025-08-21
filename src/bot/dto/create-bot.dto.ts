import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BotConfigDto {
  @ApiProperty({ description: 'Cantidad de cuadricula', example: 10 })
  gridCount: number;

  @ApiPropertyOptional({ description: 'Precio inferior del rango', example: 25000 })
  lowerPrice?: number;

  @ApiPropertyOptional({ description: 'Precio superior del rango', example: 30000 })
  upperPrice?: number;

  @ApiProperty({ description: 'Cantidad total a negociar', example: 1.5 })
  totalQuantity: number;

  @ApiProperty({ description: 'Margen de beneficio esperado en porcentaje', example: 1.2 })
  profitMargin: number;

  @ApiPropertyOptional({ description: 'Máximo tiempo permitido para que una orden esté abierta en milisegundos', example: 3600000 })
  maxOrderAgeMs?: number;
}

class StartBotDto {
  @ApiProperty({ description: 'Símbolo de la criptomoneda', example: 'BTCUSDT' })
  symbol: string;

  @ApiProperty({ description: 'Tipo de estrategia', example: 'grid' })
  strategyType: string;

  @ApiProperty({ description: 'Configuración específica de la estrategia' })
  config: BotConfigDto;
}
