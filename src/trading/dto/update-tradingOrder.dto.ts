import { OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { IsInt, IsEnum, IsOptional, IsDecimal } from 'class-validator';
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

  @ApiPropertyOptional({ enum: OrderType, description: 'Tipo de orden' })
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ApiPropertyOptional({ enum: OrderSide, description: 'Lado de la orden' })
  @IsOptional()
  @IsEnum(OrderSide)
  side?: OrderSide;

  @ApiPropertyOptional({ description: 'Precio de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  price?: number;

  @ApiPropertyOptional({ description: 'Cantidad de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Cantidad restante', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  quantityRemaining?: number;

  @ApiPropertyOptional({ enum: OrderStatus, description: 'Estado de la orden' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
