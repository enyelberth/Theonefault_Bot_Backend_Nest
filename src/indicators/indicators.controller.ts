import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { IndicatorsService } from './indicators.service';
import { CryptoPrice } from '@prisma/client';
import { Public } from 'src/authA/auth.guard';

class CreateCryptoPriceDto {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: Date;
}

@ApiTags('indicators')
@Controller('indicators')
export class IndicatorsController {
  constructor(private readonly indicatorsService: IndicatorsService) {}

  @Public()
  @Post('crypto-price')
  @ApiOperation({ summary: 'Crear nuevo precio para criptomoneda' })
  async createCryptoPrice(
    @Body() dto: CreateCryptoPriceDto,
  ): Promise<CryptoPrice> {
    return this.indicatorsService.createCryptoPrice(dto);
  }

  @Public()
  @Get('crypto-price/:symbol')
  @ApiOperation({ summary: 'Precios históricos de un símbolo' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  async findPricesBySymbol(@Param('symbol') symbol: string): Promise<CryptoPrice[]> {
    return this.indicatorsService.findPricesBySymbol(symbol);
  }

  @Public()
  @Get('crypto-price/latest/:symbol')
  @ApiOperation({ summary: 'Último precio registrado' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  async findLatestPrice(@Param('symbol') symbol: string): Promise<CryptoPrice | null> {
    return this.indicatorsService.findLatestPrice(symbol);
  }

  @Public()
  @Get('rsi/:symbol')
  @ApiOperation({ summary: 'RSI' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 14 })
  async getRSI(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('period') period?: string,
  ) {
    return this.indicatorsService.getRSI(symbol.toUpperCase(), interval, period ? Number(period) : 14);
  }

  @Public()
  @Get('bollinger/:symbol')
  @ApiOperation({ summary: 'Bandas de Bollinger' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'k', required: false, type: Number, example: 2 })
  async getBollinger(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('period') period?: string,
    @Query('k') k?: string,
  ) {
    return this.indicatorsService.getBollinger(
      symbol.toUpperCase(),
      interval,
      period ? Number(period) : 20,
      k ? Number(k) : 2,
    );
  }

  @Public()
  @Get('macd/:symbol')
  @ApiOperation({ summary: 'MACD' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  async getMACD(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('fast') fast?: string,
    @Query('slow') slow?: string,
    @Query('signal') signalP?: string,
  ) {
    return this.indicatorsService.getMACD(
      symbol.toUpperCase(),
      interval,
      fast ? Number(fast) : 12,
      slow ? Number(slow) : 26,
      signalP ? Number(signalP) : 9,
    );
  }

  @Public()
  @Get('atr/:symbol')
  @ApiOperation({ summary: 'Average True Range' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  @ApiQuery({ name: 'period', required: false, type: Number, example: 14 })
  async getATR(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('period') period?: string,
  ) {
    return this.indicatorsService.getATR(symbol.toUpperCase(), interval, period ? Number(period) : 14);
  }

  @Public()
  @Get('vwap/:symbol')
  @ApiOperation({ summary: 'VWAP' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  @ApiQuery({ name: 'lookback', required: false, type: Number, example: 96 })
  async getVWAP(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('lookback') lookback?: string,
  ) {
    return this.indicatorsService.getVWAP(
      symbol.toUpperCase(),
      interval,
      lookback ? Number(lookback) : 96,
    );
  }

  @Public()
  @Get('trend/:symbol')
  @ApiOperation({ summary: 'Detección tendencia (EMA cross + slope)' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  async getTrend(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('fast') fast?: string,
    @Query('slow') slow?: string,
  ) {
    return this.indicatorsService.getTrend(
      symbol.toUpperCase(),
      interval,
      fast ? Number(fast) : 20,
      slow ? Number(slow) : 50,
    );
  }

  @Public()
  @Get('ema/:symbol')
  @ApiOperation({ summary: 'EMA' })
  async getEMA(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('period') period?: string,
  ) {
    return this.indicatorsService.getEMA(symbol.toUpperCase(), interval, period ? Number(period) : 20);
  }

  @Public()
  @Get('sma/:symbol')
  @ApiOperation({ summary: 'SMA' })
  async getSMA(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
    @Query('period') period?: string,
  ) {
    return this.indicatorsService.getSMA(symbol.toUpperCase(), interval, period ? Number(period) : 20);
  }

  @Public()
  @Get('snapshot/:symbol')
  @ApiOperation({ summary: 'Snapshot completo (RSI, Bollinger, MACD, ATR, VWAP, trend, EMAs)' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', required: false, example: '1m' })
  @ApiResponse({ status: 200, description: 'Indicadores agregados' })
  async getSnapshot(
    @Param('symbol') symbol: string,
    @Query('interval') interval = '1m',
  ) {
    return this.indicatorsService.getSnapshot(symbol.toUpperCase(), interval);
  }
}
