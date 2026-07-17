import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'] as const;
type Timeframe = typeof TIMEFRAMES[number];

export class ExchangeSelectionDto {
  @IsIn(['real', 'paper']) mode: 'real' | 'paper';
  @IsOptional() @IsIn(['binance', 'bybit', 'okx', 'kraken']) exchangeId?: 'binance' | 'bybit' | 'okx' | 'kraken';
  @IsOptional() @IsInt() @IsPositive() paperAccountId?: number;
}

export class StartBotDto {
  @IsString() @Length(1, 100) runId: string;
  @IsString() strategyId: string;
  @IsString() symbol: string;
  @IsIn(TIMEFRAMES as unknown as string[]) timeframe: Timeframe;
  @IsObject() config: Record<string, unknown>;
  @ValidateNested() @Type(() => ExchangeSelectionDto) exchange: ExchangeSelectionDto;
  @IsOptional() @IsNumber() @Min(1000) pollMs?: number;
  @IsOptional() @IsInt() @Min(0) warmupBars?: number;
  @IsOptional() @IsInt() @IsPositive() riskProfileId?: number;
}
