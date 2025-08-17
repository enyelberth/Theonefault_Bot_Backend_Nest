import { OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { IsInt, IsEnum, IsOptional, IsDecimal, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTradingOrderDto {
  @ApiProperty({ description: 'ID de la cuenta' })
  @IsInt()
  accountId: number;

  @ApiProperty({ description: 'ID del par de trading' })
  @IsInt()
  tradingPairId: number;

  @ApiProperty({ enum: OrderType, description: 'Tipo de orden' })
  @IsEnum(OrderType)
  orderType: OrderType;

  @ApiProperty({ enum: OrderSide, description: 'Lado de la orden' })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiPropertyOptional({ description: 'Precio de la orden', type: 'number', format: 'decimal' })
  @IsOptional()
  @IsDecimal()
  price?: number |null;

  @ApiProperty({ description: 'Cantidad de la orden', type: 'number', format: 'decimal' })
  @IsDecimal()
  @IsPositive()
  quantity: number;

  @ApiProperty({ description: 'Cantidad restante', type: 'number', format: 'decimal' })
  @IsDecimal()
  @IsPositive()
  quantityRemaining: number;

  @ApiPropertyOptional({ enum: OrderStatus, description: 'Estado de la orden' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
