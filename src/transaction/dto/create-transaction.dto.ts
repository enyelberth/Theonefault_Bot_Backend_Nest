import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsIn,
} from 'class-validator';

export class CreateTransactionDto {
  @ApiProperty({ description: 'Identificador único de la transacción', example: 'tx_123abc' })
  @IsString()
  @IsNotEmpty()
  idTransaction: string;

  @ApiProperty({ description: 'ID de la cuenta relacionada', example: 1 })
  @IsInt()
  accountId: number;

  @ApiProperty({
    description: 'Tipo de orden',
    example: 'limit',
    enum: ['limit', 'market', 'stop-limit'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['limit', 'market', 'stop-limit'])
  typeOrder: string;

  @ApiProperty({ description: 'Cantidad de criptomoneda', example: 0.5 })
  @IsNumber()
  amount: number;

  @ApiProperty({ description: 'Divisa (fiat o cripto)', example: 'USDT' })
  @IsString()
  currency: string;

  @ApiProperty({ description: 'ID del par cripto', example: 10 })
  @IsInt()
  cryptoPairId: number;

  @ApiProperty({
    description: 'Lado de la orden',
    example: 'buy',
    enum: ['buy', 'sell'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['buy', 'sell'])
  side: string;

  @ApiProperty({
    description: 'Estado de la orden',
    example: 'open',
    enum: ['open', 'closed', 'cancelled'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['open', 'closed', 'cancelled'])
  status: string;

  @ApiProperty({ description: 'Precio de entrada', example: 45000.0 })
  @IsNumber()
  entryPrice: number;

  @ApiPropertyOptional({
    description: 'Fecha y hora de entrada en formato ISO',
    example: '2025-08-11T23:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  entryTimestamp?: string;

  @ApiPropertyOptional({ description: 'Precio de salida', example: 46000.0 })
  @IsOptional()
  @IsNumber()
  exitPrice?: number;

  @ApiPropertyOptional({
    description: 'Fecha y hora de salida en formato ISO',
    example: '2025-08-12T15:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  exitTimestamp?: string;

  @ApiPropertyOptional({ description: 'Ganancia o pérdida', example: 1000.5 })
  @IsOptional()
  @IsNumber()
  profitLoss?: number;

  @ApiPropertyOptional({ description: 'Indica si la transacción está cerrada', example: false })
  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}
