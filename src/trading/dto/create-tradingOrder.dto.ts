import { OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { IsInt, IsEnum, IsOptional, IsDecimal, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTradingOrderDto {
  @ApiProperty({ description: 'ID de la cuenta',example: 1 })
  @IsInt()
  accountId: number;
/*
  @ApiProperty({ description: 'ID del par de trading' })
  @IsInt()
  tradingPairId: number;*/

  @ApiProperty({ description: 'Símbolo del activo',example: 'BTCUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'ID único de la orden' })
  @IsInt()
  orderId: number;

  @ApiProperty({ description: 'ID único de cliente para la orden', example: 'my_order_123' })
  @IsString()
  client_order_id: string;

  @ApiProperty({ enum: OrderSide, description: 'Lado de la orden (BUY o SELL)' })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiPropertyOptional({ description: 'Precio de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  price?: number | null;

  @ApiProperty({ description: 'Cantidad total de la orden', type: 'number', format: 'decimal' })
  @IsDecimal()
  @IsPositive()
  quantity: number;

  @ApiProperty({ description: 'Cantidad ejecutada de la orden', type: 'number', format: 'decimal' })
  @IsDecimal()
  @IsPositive()
  quantityExecuted: number;

  @ApiPropertyOptional({ enum: OrderStatus, description: 'Estado de la orden' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ enum: OrderType, description: 'Tipo de orden' })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiPropertyOptional({ description: 'Precio stop si aplica', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  stopPrice?: number | null;

  @ApiPropertyOptional({ description: 'Cantidad stop si aplica', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  quantityStop?: number | null;

  @ApiPropertyOptional({ description: 'Indica si la orden está activa' })
  @IsOptional()
  isWorking?: boolean;

  @ApiPropertyOptional({ description: 'ID de la orden que cierra esta (si aplica)' })
  @IsOptional()
  @IsInt()
  closingOrderId?: number | null;
  @ApiPropertyOptional({ description: 'Ganancias o pérdidas', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  profit_loss?: number | null;

  @ApiPropertyOptional({ description: 'Límite máximo de pérdida diaria permitido para esta operación' })
  @IsOptional()
  @IsDecimal()
  maxDailyLoss?: number;

  @ApiPropertyOptional({ description: 'Máximo drawdown permitido para la cuenta al intentar operar' })
  @IsOptional()
  @IsDecimal()
  maxDrawdown?: number;

  @ApiPropertyOptional({ description: 'Exposición máxima permitida por símbolo' })
  @IsOptional()
  @IsDecimal()
  maxSymbolExposure?: number;

  @ApiPropertyOptional({ description: 'Hora UTC inicial permitida para ejecutar la orden', minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  allowedFromHourUtc?: number;

  @ApiPropertyOptional({ description: 'Hora UTC final permitida para ejecutar la orden', minimum: 0, maximum: 23 })
  @IsOptional()
  @IsInt()
  allowedToHourUtc?: number;

  @ApiPropertyOptional({ description: 'Motivo o señal del bot para auditar la decisión' })
  @IsOptional()
  @IsString()
  decisionReason?: string;

  @ApiPropertyOptional({ description: 'Marca la orden como paper trading' })
  @IsOptional()
  paperTrading?: boolean;
}
