import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsInt, IsString, MaxLength } from 'class-validator';

export class CreateAccountBalanceDto {
  @ApiProperty({ description: 'ID de la cuenta', example: 1 })
  @IsInt()
  accountId: number;

  @ApiProperty({ description: 'Código de moneda', example: 'USDT', maxLength: 5 })
  @IsString()
  @MaxLength(5)
  currencyCode: string;

  @ApiProperty({ description: 'Balance actual', type: String, example: '1250.55' })
  @IsDecimal()
  balance: string;
}