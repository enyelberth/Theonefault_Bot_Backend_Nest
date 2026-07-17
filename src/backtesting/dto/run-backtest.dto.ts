import {
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class FeesDto {
  @IsNumber() @Min(0) makerBps: number;
  @IsNumber() @Min(0) takerBps: number;
  @IsNumber() @Min(0) slippageBps: number;
  @IsOptional() @IsNumber() @Min(0) spreadBps?: number;
}

export class RunBacktestDto {
  @IsString() strategyId: string;
  @IsString() symbol: string;
  @IsString() timeframe: string;
  @IsISO8601() startTime: string;
  @IsISO8601() endTime: string;
  @IsNumber() @IsPositive() initialQuote: number;
  @IsObject() config: Record<string, unknown>;
  @IsOptional() fees?: FeesDto;
  @IsOptional() @IsInt() @Min(0) warmupBars?: number;
  @IsOptional() @IsInt() createdBy?: number;
}
