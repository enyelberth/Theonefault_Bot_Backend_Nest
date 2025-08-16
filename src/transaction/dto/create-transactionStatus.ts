import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransactionStatusDto {
  @ApiPropertyOptional({ description: 'ID del estado de transacción (autogenerado)' })
  @IsOptional() // Para cuando creas, el id puede ser autogenerado
  @IsInt()
  id?: number;

  @ApiProperty({ description: 'Nombre del estado de transacción', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  statusName: string;
}
