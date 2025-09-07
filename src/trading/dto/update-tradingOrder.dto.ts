import { OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { IsInt, IsEnum, IsOptional, IsDecimal, IsPositive, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTradingOrderDto {
  @ApiPropertyOptional({ description: 'ID de la cuenta' })
  @IsOptional()
  @IsInt()
  accountId?: number;

  @ApiPropertyOptional({ description: 'ID del par de trading' })
  @IsOptional()
  @IsInt()
  tradingPairId?: number;

  @ApiPropertyOptional({ description: 'Símbolo del activo' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ description: 'ID único de la orden' })
  @IsOptional()
  @IsInt()
  orderId?: number;

  @ApiPropertyOptional({ description: 'ID único de cliente para la orden' })
  @IsOptional()
  @IsString()
  client_order_id?: string;

  @ApiPropertyOptional({ enum: OrderSide, description: 'Lado de la orden (BUY o SELL)' })
  @IsOptional()
  @IsEnum(OrderSide)
  side?: OrderSide;

  @ApiPropertyOptional({ description: 'Precio de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  price?: number | null;

  @ApiPropertyOptional({ description: 'Cantidad total de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  @IsPositive()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Cantidad ejecutada de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  @IsPositive()
  quantityExecuted?: number;

  @ApiPropertyOptional({ enum: OrderStatus, description: 'Estado de la orden' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ enum: OrderType, description: 'Tipo de orden' })
  @IsOptional()
  @IsEnum(OrderType)
  type?: OrderType;

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
  @IsBoolean()
  isWorking?: boolean;

  @ApiPropertyOptional({ description: 'ID de la orden que cierra esta (si aplica)' })
  @IsOptional()
  @IsInt()
  closingOrderId?: number | null;
}
