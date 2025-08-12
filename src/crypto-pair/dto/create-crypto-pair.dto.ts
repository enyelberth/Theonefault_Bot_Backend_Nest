import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCryptoPairDto {
  @ApiProperty({
    description: 'The unique symbol of the crypto pair (e.g., "BTC/USDT")',
    example: 'BTC/USDT',
  })
  @IsString()
  @IsNotEmpty()
  symbolPair: string;
}