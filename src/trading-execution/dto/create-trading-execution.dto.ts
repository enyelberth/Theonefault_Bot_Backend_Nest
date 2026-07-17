import { ApiProperty } from '@nestjs/swagger';

export class CreateTradingExecutionDto {
  @ApiProperty({ example: 1 })
  orderId: number;

  @ApiProperty({ example: '100.50' })
  tradePrice: string;

  @ApiProperty({ example: '0.001' })
  tradeQuantity: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  tradeTimestamp: string;
}
