import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateRiskProfileDto {
  @IsString() @Length(1, 100) name: string;
  @IsOptional() @IsInt() ownerId?: number;
  @IsOptional() @IsNumber() @Min(0) maxDrawdownPct?: number;
  @IsOptional() @IsNumber() @Min(0) maxDailyLossPct?: number;
  @IsOptional() @IsNumber() @Min(0) maxPositionSizePct?: number;
  @IsOptional() @IsInt() @Min(1) maxOpenPositions?: number;
  @IsOptional() @IsObject() sizer?: Record<string, unknown>;
  @IsOptional() @IsObject() trailingStop?: Record<string, unknown>;
  @IsOptional() @IsObject() tpLadder?: Record<string, unknown>;
}

export class UpdateRiskProfileDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsNumber() @Min(0) maxDrawdownPct?: number;
  @IsOptional() @IsNumber() @Min(0) maxDailyLossPct?: number;
  @IsOptional() @IsNumber() @Min(0) maxPositionSizePct?: number;
  @IsOptional() @IsInt() @Min(1) maxOpenPositions?: number;
  @IsOptional() @IsObject() sizer?: Record<string, unknown>;
  @IsOptional() @IsObject() trailingStop?: Record<string, unknown>;
  @IsOptional() @IsObject() tpLadder?: Record<string, unknown>;
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class KillSwitchDto {
  @IsIn(['GLOBAL', 'USER', 'BOT']) scope: 'GLOBAL' | 'USER' | 'BOT';
  @IsOptional() @IsString() targetId?: string;
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() triggeredBy?: string;
}
