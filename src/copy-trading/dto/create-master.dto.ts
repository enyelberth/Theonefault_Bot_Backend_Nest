import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CopyVisibility } from '@prisma/client';

export class CreateMasterDto {
  @ApiProperty() @IsString() @MinLength(1) runId!: string;
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() ownerId?: number;
  @ApiPropertyOptional({ enum: CopyVisibility })
  @IsOptional()
  @IsEnum(CopyVisibility)
  visibility?: CopyVisibility;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
