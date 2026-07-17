import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MarketDataService } from './market-data.service';
import { SymbolRegistryService } from './symbol-registry.service';
import { Public } from 'src/authA/auth.guard';

@ApiTags('market-data')
@Controller('market-data')
export class MarketDataController {
  constructor(
    private readonly marketData: MarketDataService,
    private readonly symbolRegistry: SymbolRegistryService,
  ) {}

  @Public()
  @Get('candles/:symbol')
  @ApiOperation({ summary: 'Velas OHLCV por símbolo e intervalo' })
  @ApiParam({ name: 'symbol', example: 'BTCFDUSD' })
  @ApiQuery({ name: 'interval', example: '1m' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async getCandles(
    @Param('symbol') symbol: string,
    @Query('interval') interval: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    if (!interval) throw new BadRequestException('interval required');
    return this.marketData.getCandles({
      symbol: symbol.toUpperCase(),
      interval,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number(limit) : 500,
    });
  }

  @Public()
  @Get('candles/:symbol/latest')
  @ApiOperation({ summary: 'Última vela cerrada' })
  @ApiQuery({ name: 'interval', example: '1m' })
  async getLatest(@Param('symbol') symbol: string, @Query('interval') interval: string) {
    if (!interval) throw new BadRequestException('interval required');
    return this.marketData.getLatestCandle(symbol.toUpperCase(), interval);
  }

  @Public()
  @Get('prices/:symbol')
  @ApiOperation({ summary: 'Ticks de precio recientes' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  async getPrices(@Param('symbol') symbol: string, @Query('limit') limit?: string) {
    return this.marketData.getRecentPrices(
      symbol.toUpperCase(),
      limit ? Number(limit) : 500,
    );
  }

  @Public()
  @Get('symbols/active')
  @ApiOperation({ summary: 'Símbolos actualmente monitoreados' })
  async getActive() {
    return this.symbolRegistry.getActiveSymbols();
  }

  @Public()
  @Get('analytics')
  @ApiOperation({ summary: 'Estadísticas + correlación entre símbolos' })
  @ApiQuery({ name: 'symbols', required: true, description: 'CSV: BTCUSDT,ETHUSDT,...' })
  @ApiQuery({ name: 'interval', required: false, example: '1h' })
  @ApiQuery({ name: 'limit', required: false, type: 'number', example: 168 })
  async analytics(
    @Query('symbols') symbols: string,
    @Query('interval') interval?: string,
    @Query('limit') limit?: string,
  ) {
    if (!symbols) throw new BadRequestException('symbols requerido (CSV)');
    const list = symbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!list.length) throw new BadRequestException('lista vacía');
    return this.marketData.analytics({
      symbols: list,
      interval: interval || '1h',
      limit: Number(limit) || 168,
    });
  }

  @Public()
  @Post('backfill')
  @ApiOperation({ summary: 'Descarga histórico de velas desde Binance y las guarda' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', example: 'BTCUSDT' },
        interval: { type: 'string', example: '1m' },
        days: { type: 'number', example: 30 },
      },
      required: ['symbol', 'interval', 'days'],
    },
  })
  async backfill(@Body() body: { symbol: string; interval: string; days: number }) {
    if (!body.symbol || !body.interval) throw new BadRequestException('symbol e interval requeridos');
    const days = Number(body.days);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      throw new BadRequestException('days debe ser 1..365');
    }
    return this.marketData.backfill({
      symbol: body.symbol.toUpperCase(),
      interval: body.interval,
      days,
    });
  }
}
