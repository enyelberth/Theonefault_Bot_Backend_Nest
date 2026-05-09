import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsInt,
  ValidateNested,
  ArrayMinSize,
  IsDecimal,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum EntryType {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

export enum JournalPostingStatusDto {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

export const ALLOWED_ENTRY_TYPES = [
  EntryType.INGRESO,
  EntryType.EGRESO,
  'DEBIT',
  'CREDIT',
  'DEBITO',
  'DÉBITO',
  'CREDITO',
  'CRÉDITO',
] as const;

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

  @ApiProperty({
    description: 'Tipo de asiento: INGRESO/EGRESO o legacy DEBIT/CREDIT',
    enum: ALLOWED_ENTRY_TYPES,
  })
  @IsIn(ALLOWED_ENTRY_TYPES)
  entryType: string;
}

export class CreateJournalEntryLineDto {
  @ApiProperty({
    description: 'ID de la cuenta contable',
    example: 1,
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

  @ApiProperty({
    description: 'Tipo de asiento: INGRESO/EGRESO o legacy DEBIT/CREDIT',
    enum: ALLOWED_ENTRY_TYPES,
  })
  @IsIn(ALLOWED_ENTRY_TYPES)
  entryType: string;
}

export class UpdateJournalEntryLineDto {
  @ApiPropertyOptional({ description: 'ID de la cuenta contable', example: 1 })
  @IsOptional()
  @IsInt()
  accountId?: number;

  @ApiPropertyOptional({ description: 'Código de moneda', example: 'USDT' })
  @IsOptional()
  @IsString()
  currencyCode?: string;

  @ApiPropertyOptional({
    description: 'Monto de la línea contable',
    example: '13.2',
  })
  @IsOptional()
  @IsDecimal()
  amount?: string;

  @ApiPropertyOptional({
    description: 'Tipo de asiento: INGRESO/EGRESO o legacy DEBIT/CREDIT',
    enum: ALLOWED_ENTRY_TYPES,
  })
  @IsOptional()
  @IsIn(ALLOWED_ENTRY_TYPES)
  entryType?: string;
}

export class SyncBinanceBalancesDto {
  @ApiProperty({
    description:
      'Cuenta local que representa la billetera Binance a sincronizar',
    example: 2,
  })
  @IsInt()
  accountId: number;

  @ApiPropertyOptional({
    description:
      'Cuenta contrapartida para registrar el ajuste contable por reflejo de Binance. Si no se envía, se usa la cuenta técnica de ajuste.',
    example: 4,
  })
  @IsOptional()
  @IsInt()
  offsetAccountId?: number;

  @ApiPropertyOptional({
    description:
      'Incluye también monedas locales que no llegaron desde Binance para dejarlas en cero',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeZeroBalances?: boolean;

  @ApiPropertyOptional({
    description: 'Usuario o proceso responsable del ajuste',
    example: 'BINANCE_SYNC',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Descripción adicional del asiento de sincronización',
    example: 'Reflejo nocturno de saldos desde Binance',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'Ventana de idempotencia en minutos para evitar duplicados de sync',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsInt()
  idempotencyWindowMinutes?: number;
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

  @ApiPropertyOptional({
    description: 'ID del estado de la transacción',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  statusId?: number;

  @ApiPropertyOptional({
    description: 'Estado de publicación contable',
    enum: JournalPostingStatusDto,
    default: JournalPostingStatusDto.POSTED,
  })
  @IsOptional()
  @IsIn(Object.values(JournalPostingStatusDto))
  postingStatus?: JournalPostingStatusDto;

  @ApiProperty({
    type: [JournalEntryLineDto],
    description: 'Líneas (detalles) del asiento contable',
  })
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => JournalEntryLineDto)
  lines: JournalEntryLineDto[];
}

export class UpdateJournalEntryDto {
  @ApiPropertyOptional({
    description: 'Fecha y hora del asiento contable en formato ISO',
  })
  @IsOptional()
  @IsDateString()
  entryDate?: string;

  @ApiPropertyOptional({ description: 'Descripción del asiento contable' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Usuario que crea o modifica el asiento',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ description: 'ID del estado de la transacción' })
  @IsOptional()
  @IsInt()
  statusId?: number;

  @ApiPropertyOptional({
    description: 'Estado de publicación contable',
    enum: JournalPostingStatusDto,
  })
  @IsOptional()
  @IsIn(Object.values(JournalPostingStatusDto))
  postingStatus?: JournalPostingStatusDto;

  @ApiPropertyOptional({
    type: [JournalEntryLineDto],
    description: 'Líneas (detalles) del asiento contable',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => JournalEntryLineDto)
  lines?: JournalEntryLineDto[];
}

export class CreateAccountingPeriodDto {
  @ApiProperty({
    description: 'Nombre del período contable',
    example: '2026-04',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Inicio del período en formato ISO',
    example: '2026-04-01T00:00:00.000Z',
  })
  @IsDateString()
  startsAt: string;

  @ApiProperty({
    description: 'Fin del período en formato ISO',
    example: '2026-04-30T23:59:59.999Z',
  })
  @IsDateString()
  endsAt: string;
}

export class ReverseJournalEntryDto {
  @ApiPropertyOptional({
    description: 'Razón de reversión',
    example: 'Corrección por ajuste contable.',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Usuario/proceso que ejecuta la reversión',
    example: 'ACCOUNTING_ADMIN',
  })
  @IsOptional()
  @IsString()
  reversedBy?: string;
}
