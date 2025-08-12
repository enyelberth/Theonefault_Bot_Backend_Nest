import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsIn,
} from 'class-validator';

export class UpdateTransactionDto {
  @ApiPropertyOptional({ description: 'Identificador único de la transacción', example: 'tx_123abc' })
  @IsOptional()
  @IsString()
  idTransaction?: string;

  @ApiPropertyOptional({ description: 'ID de la cuenta relacionada', example: 1 })
  @IsOptional()
  @IsInt()
  accountId?: number;

  @ApiPropertyOptional({
    description: 'Tipo de orden',
    example: 'limit',
    enum: ['limit', 'market', 'stop-limit'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['limit', 'market', 'stop-limit'])
  typeOrder?: string;

  @ApiPropertyOptional({ description: 'Cantidad de criptomoneda', example: 0.5 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Divisa (fiat o cripto)', example: 'USDT' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'ID del par cripto', example: 10 })
  @IsOptional()
  @IsInt()
  cryptoPairId?: number;

  @ApiPropertyOptional({
    description: 'Lado de la orden',
    example: 'buy',
    enum: ['buy', 'sell'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['buy', 'sell'])
  side?: string;

  @ApiPropertyOptional({
    description: 'Estado de la orden',
    example: 'open',
    enum: ['open', 'closed', 'cancelled'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['open', 'closed', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ description: 'Precio de entrada', example: 45000.0 })
  @IsOptional()
  @IsNumber()
  entryPrice?: number;

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
