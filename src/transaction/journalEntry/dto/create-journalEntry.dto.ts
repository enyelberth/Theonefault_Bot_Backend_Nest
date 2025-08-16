import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsInt, ValidateNested, ArrayMinSize, IsEnum, IsDecimal } from 'class-validator';
import { Type } from 'class-transformer';

export enum EntryType {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

export class JournalEntryLineDto {
  @ApiProperty({ 
    description: 'ID de la cuenta contable',
    example: '1',

  })
  @IsInt()
  accountId: number;

  @ApiProperty({ 
    description: 'Código de moneda (máx 5 caracteres)',
    example: 'USDT',
   })
  @IsString()
  currencyCode: string;

  @ApiProperty({ 
    description: 'Monto de la línea contable',
    example: '13.2',
   })
  @IsDecimal()
  amount: string;

  @ApiProperty({ description: 'Tipo de asiento: INGRESO o EGRESO', enum: EntryType })
  @IsEnum(EntryType)
  entryType: EntryType;
}

export class CreateJournalEntryDto {
  @ApiProperty({ 
    description: 'Fecha y hora del asiento contable en formato ISO',
    example: '2023-03-15T12:00:00Z',
   })
  @IsDateString()
  entryDate: string;

  @ApiPropertyOptional({ 
    description: 'Descripción del asiento contable',
    example: 'Pago a proveedor ',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Usuario que crea el asiento contable',
    example: 'Enyelberth',
   })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'ID del estado de la transacción', default: 1 })
  @IsOptional()
  @IsInt()
  statusId?: number;

  @ApiProperty({ type: [JournalEntryLineDto], description: 'Líneas (detalles) del asiento contable' })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => JournalEntryLineDto)
  lines: JournalEntryLineDto[];
}

export class UpdateJournalEntryDto {
  @ApiPropertyOptional({ description: 'Fecha y hora del asiento contable en formato ISO' })
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @ApiPropertyOptional({ description: 'Descripción del asiento contable' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Usuario que crea o modifica el asiento' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'ID del estado de la transacción' })
  @IsOptional()
  @IsInt()
  statusId?: number;

  @ApiPropertyOptional({ type: [JournalEntryLineDto], description: 'Líneas (detalles) del asiento contable' })
  @IsOptional()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => JournalEntryLineDto)
  lines?: JournalEntryLineDto[];
}
