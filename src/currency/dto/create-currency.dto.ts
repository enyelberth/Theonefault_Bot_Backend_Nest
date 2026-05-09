import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({
    description: 'Código de moneda',
    example: 'USDT',
    maxLength: 5,
  })
  @IsString()
  @MaxLength(5)
  code: string;

  @ApiPropertyOptional({ description: 'Descripción de la moneda' })
  @IsOptional()
  @IsString()
  description?: string;
}
