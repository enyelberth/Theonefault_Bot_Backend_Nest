import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FeesConfigDto {
  @IsNumber() @Min(0) makerBps: number;
  @IsNumber() @Min(0) takerBps: number;
  @IsNumber() @Min(0) slippageBps: number;
  @IsOptional() @IsNumber() @Min(0) spreadBps?: number;
}

export class CreatePaperAccountDto {
  @IsString() @Length(1, 100) name: string;
  @IsOptional() @IsInt() ownerId?: number;
  @IsNumber() @IsPositive() initialQuote: number;
  @IsOptional() @IsString() quoteAsset?: string;
  @IsOptional() @ValidateNested() @Type(() => FeesConfigDto) fees?: FeesConfigDto;
}

export class UpdatePaperAccountDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @ValidateNested() @Type(() => FeesConfigDto) fees?: FeesConfigDto;
}

export class PlacePaperOrderDto {
  @IsString() symbol: string;
  @IsString() side: 'BUY' | 'SELL';
  @IsString() type: 'MARKET' | 'LIMIT' | 'STOP_LOSS_LIMIT';
  @IsOptional() @IsNumber() @IsPositive() quantity?: number;
  @IsOptional() @IsNumber() @IsPositive() quoteQuantity?: number;
  @IsOptional() @IsNumber() @IsPositive() price?: number;
  @IsOptional() @IsNumber() @IsPositive() stopPrice?: number;
}
