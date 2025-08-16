import { IsInt, IsOptional, IsString, IsDecimal, IsDateString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransferDto {
  
  @ApiProperty({ description: 'ID de la cuenta origen' })
  @IsInt()
  fromAccountId: number;

  @ApiProperty({ description: 'ID de la cuenta destino' })
  @IsInt()
  toAccountId: number;

  @ApiProperty({ description: 'Código de moneda (máx 5 caracteres)', maxLength: 5 })
  @IsString()
  @MaxLength(5)
  currencyCode: string;

  @ApiProperty({ description: 'Monto a transferir', minimum: 0.01, type: String })
  @IsDecimal()
  @Min(0.01)
  amount: string;  // Usar string para precisión Decimal

  @ApiPropertyOptional({ description: 'Fecha de transferencia en formato ISO 8601' })
  @IsDateString()
  @IsOptional()
  transferDate?: string;

  @ApiProperty({ description: 'ID del asiento contable relacionado' })
  @IsInt()
  journalEntryId: number;

  @ApiPropertyOptional({ description: 'Descripción de la transferencia', maxLength: 255 })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'ID del estado de la transacción' })
  @IsInt()
  @IsOptional()
  statusId?: number;
}
