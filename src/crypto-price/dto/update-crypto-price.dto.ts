import { IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCryptoPriceDto {
  @ApiProperty({
    description: 'The ID of the crypto pair this price belongs to',
    example: 1,
    required: false,
  })
  @IsNumber()
  pairId?: number;

  @ApiProperty({
    description: 'The price of the crypto pair',
    example: 45100.25,
    required: false,
  })
  @IsNumber()
  price?: number;
}