import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderSide, OrderType } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class SimulateTradingOrderDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  accountId: number;

  @ApiProperty({ example: 'BTCUSDT' })
  @IsString()
  symbol: string;

  @ApiProperty({ enum: OrderSide })
  @IsEnum(OrderSide)
  side: OrderSide;

  @ApiProperty({ enum: OrderType })
  @IsEnum(OrderType)
  type: OrderType;

  @ApiProperty({ example: 0.1 })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ example: 65000 })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  maxDailyLoss?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsNumber()
  maxDrawdown?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  maxSymbolExposure?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  allowedFromHourUtc?: number;

  @ApiPropertyOptional({ example: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  allowedToHourUtc?: number;

  @ApiPropertyOptional({ example: 'signal:rsi_oversold' })
  @IsOptional()
  @IsString()
  decisionReason?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  paperTrading?: boolean;
}
