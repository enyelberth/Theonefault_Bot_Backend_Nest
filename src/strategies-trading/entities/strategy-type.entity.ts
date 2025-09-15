// strategy-type.entity.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StrategyType {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  createdAt: Date;
}
