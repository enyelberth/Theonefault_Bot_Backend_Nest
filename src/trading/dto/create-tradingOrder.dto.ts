import { OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { IsInt, IsEnum, IsOptional, IsDecimal, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTradingOrderDto {
  @ApiProperty({ description: 'ID de la cuenta' })
  @IsInt()
  accountId: number;

  @ApiProperty({ description: 'ID del par de trading' })
  @IsInt()
  tradingPairId: number;

  @ApiProperty({ description: 'Símbolo del activo' })
  @IsString()
  symbol: string;

  @ApiProperty({ description: 'ID único de la orden' })
  @IsInt()
  orderId: number;

  @ApiProperty({ description: 'ID único de cliente para la orden' })
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
}
