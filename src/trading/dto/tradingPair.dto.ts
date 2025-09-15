import { IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTradingPairDto {
  @ApiProperty({ description: 'Código de la moneda base', maxLength: 5 })
  @IsString()
  @Length(1, 5)
  baseCurrencyCode: string;

  @ApiProperty({ description: 'Código de la moneda cotizada', maxLength: 5 })
  @IsString()
  @Length(1, 5)
  quoteCurrencyCode: string;
}

export class UpdateTradingPairDto {
  @ApiPropertyOptional({ description: 'Código de la moneda base', maxLength: 5 })
  @IsString()
  @Length(1, 5)
  baseCurrencyCode?: string;

  @ApiPropertyOptional({ description: 'Código de la moneda cotizada', maxLength: 5 })
  @IsString()
  @Length(1, 5)
  quoteCurrencyCode?: string;
}
