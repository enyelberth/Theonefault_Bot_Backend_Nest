import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { CopyMode } from '@prisma/client';

export class CreateSubscriptionDto {
  @ApiProperty() @IsInt() masterId!: number;
  @ApiProperty() @IsString() @MinLength(1) followerRunId!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() ownerId?: number;
  @ApiProperty({ enum: ['real', 'paper'] })
  @IsIn(['real', 'paper'])
  exchangeMode!: 'real' | 'paper';
  @ApiPropertyOptional() @IsOptional() @IsString() exchangeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() paperAccountId?: number;
  @ApiPropertyOptional({ enum: CopyMode })
  @IsOptional()
  @IsEnum(CopyMode)
  mode?: CopyMode;
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  sizeMultiplier?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() fixedQuote?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() maxRiskPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
