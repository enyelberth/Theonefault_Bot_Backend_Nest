// trading-strategy.entity.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsJSON, IsString } from 'class-validator';

export class TradingStrategy {
  @ApiProperty()
  @IsInt()

  id: number;

  @ApiProperty()
  @IsString()
  symbol: string;

  @ApiProperty()
  @IsInt()
  typeId: number;

  @ApiProperty()
  @IsJSON()
  config: object;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
