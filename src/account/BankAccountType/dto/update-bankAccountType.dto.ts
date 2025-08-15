import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBankAccountTypeDto {
  @ApiPropertyOptional({
    description: 'Nombre del tipo de cuenta bancaria',
    example: 'Cuenta Corriente',
  })
  @IsOptional()
  @IsString()
  typeName?: string;

  @ApiPropertyOptional({
    description: 'Descripción del tipo de cuenta',
    example: 'Cuenta destinada para operaciones frecuentes',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
