import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CreateCurrencyDto {
  @ApiProperty({ example: 'USDT' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 5)
  code: string;

  @ApiPropertyOptional({ example: 'Tether USD' })
  @IsOptional()
  @IsString()
  description?: string;
}
