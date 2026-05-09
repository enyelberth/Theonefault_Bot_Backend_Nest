import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsDecimal, IsInt, IsOptional } from 'class-validator';

export class CreateTradingExecutionDto {
  @ApiProperty({ description: 'ID de la orden', example: 1 })
  @IsInt()
  orderId: number;

  @ApiProperty({
    description: 'Precio ejecutado',
    type: String,
    example: '32000.25',
  })
  @IsDecimal()
  tradePrice: string;

  @ApiProperty({
    description: 'Cantidad ejecutada',
    type: String,
    example: '0.005',
  })
  @IsDecimal()
  tradeQuantity: string;

  @ApiPropertyOptional({ description: 'Fecha de la ejecución en ISO' })
  @IsOptional()
  @IsDateString()
  tradeTimestamp?: string;
}
