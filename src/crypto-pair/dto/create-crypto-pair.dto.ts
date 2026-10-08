import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCryptoPairDto {
  @ApiProperty({ example: 'BTC' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 5)
  baseCurrencyCode: string;

  @ApiProperty({ example: 'USDT' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 5)
  quoteCurrencyCode: string;
}
