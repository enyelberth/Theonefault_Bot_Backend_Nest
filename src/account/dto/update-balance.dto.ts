import { IsInt, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateBalanceDto {
  @ApiProperty({ description: 'ID de la cuenta', example: 1 })
  @IsInt()
  @Type(() => Number)
  accountId: number;

  @ApiProperty({ description: 'Código de la moneda (ejemplo: BTC)', example: 'BTC' })
  @IsString()
  currencyCode: string;

  @ApiProperty({ description: 'Nuevo saldo para la cuenta y moneda', example: 0.1234 })
  @IsNumber({ maxDecimalPlaces: 18 })
  @Min(0)
  @Type(() => Number)
  newBalance: number;
}
