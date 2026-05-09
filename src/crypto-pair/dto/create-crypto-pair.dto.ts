import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCryptoPairDto {
  @ApiProperty({
    description: 'Código de la moneda base',
    example: 'BTC',
  })
  @IsString()
  @MaxLength(5)
  baseCurrencyCode: string;

  @ApiProperty({
    description: 'Código de la moneda de cotización',
    example: 'USDT',
  })
  @IsString()
  @MaxLength(5)
  quoteCurrencyCode: string;
}
