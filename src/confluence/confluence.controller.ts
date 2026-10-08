import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ConfluenceService } from './confluence.service';

@ApiTags('confluence')
@Controller('confluence')
export class ConfluenceController {
  constructor(private readonly confluence: ConfluenceService) {}

  @Get(':symbol/:timeframe')
  @ApiOperation({
    summary:
      'Score de confianza direccional (0-100, 50=neutral) combinando régimen, ' +
      'alineación multi-timeframe (1h/4h por default) y momentum (RSI/MACD/Bollinger). ' +
      'Informativo: no coloca ni bloquea órdenes.',
  })
  @ApiParam({ name: 'symbol', example: 'BTCUSDT' })
  @ApiParam({ name: 'timeframe', example: '15m' })
  current(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
  ) {
    return this.confluence.compute(symbol, timeframe);
  }

  @Get(':symbol/:timeframe/history')
  @ApiOperation({ summary: 'Historial de scores de confluencia calculados' })
  @ApiParam({ name: 'symbol', example: 'BTCUSDT' })
  @ApiParam({ name: 'timeframe', example: '15m' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  history(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
    @Query('limit') limit?: string,
  ) {
    return this.confluence.history(
      symbol,
      timeframe,
      limit ? Number(limit) : 100,
    );
  }
}
