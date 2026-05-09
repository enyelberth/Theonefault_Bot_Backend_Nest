import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  IsDecimal,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTransferDto {
  @ApiPropertyOptional({ description: 'ID de la cuenta origen' })
  @IsOptional()
  @IsInt()
  fromAccountId?: number;

  @ApiPropertyOptional({ description: 'ID de la cuenta destino' })
  @IsOptional()
  @IsInt()
  toAccountId?: number;

  @ApiPropertyOptional({ description: 'Código de moneda (máx 5 caracteres)' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currencyCode?: string;

  @ApiPropertyOptional({
    description: 'Monto a transferir',
    minimum: 0.01,
    type: String,
  })
  @IsOptional()
  @IsDecimal()
  @Min(0.01)
  amount?: string;

  @ApiPropertyOptional({
    description: 'Fecha de transferencia en formato ISO 8601',
  })
  @IsOptional()
  @IsDateString()
  transferDate?: string;

  @ApiPropertyOptional({ description: 'ID del asiento contable relacionado' })
  @IsOptional()
  @IsInt()
  journalEntryId?: number;

  @ApiPropertyOptional({
    description: 'Descripción de la transferencia',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({ description: 'ID del estado de la transacción' })
  @IsOptional()
  @IsInt()
  statusId?: number;
}
