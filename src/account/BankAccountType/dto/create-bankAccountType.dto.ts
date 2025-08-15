import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBankAccountTypeDto {
  @ApiProperty({
    description: 'Nombre del tipo de cuenta bancaria',
    example: 'Cuenta de Ahorros',
  })
  @IsString()
  @IsNotEmpty()
  typeName: string;

  @ApiPropertyOptional({
    description: 'Descripción opcional del tipo de cuenta',
    example: 'Cuenta destinada para ahorro personal',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
