import { IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCryptoPriceDto {
  @ApiProperty({
    description: 'The ID of the crypto pair this price belongs to',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  pairId: number;

  @ApiProperty({
    description: 'The price of the crypto pair',
    example: 45000.55,
  })
  @IsNumber()
  @IsNotEmpty()
  price: number;
}
