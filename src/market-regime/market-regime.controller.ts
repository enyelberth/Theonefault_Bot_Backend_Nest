import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MarketRegimeService } from './market-regime.service';

@ApiTags('market-regime')
@Controller('market-regime')
export class MarketRegimeController {
  constructor(private readonly regimes: MarketRegimeService) {}

  @Get('timeframes/:runId/history')
  @ApiOperation({
    summary: 'Historial de confluencia multi-timeframe de un runner',
  })
  timeframeHistory(
    @Param('runId') runId: string,
    @Query('limit') limit?: string,
  ) {
    return this.regimes.listTimeframeEvaluations(
      runId,
      limit ? Number(limit) : 100,
    );
  }

  @Get(':symbol/:timeframe')
  @ApiOperation({
    summary: 'Detectar el régimen actual usando velas persistidas',
  })
  current(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
    @Query('limit') limit?: string,
  ) {
    return this.regimes.current(symbol, timeframe, limit ? Number(limit) : 100);
  }

  @Get(':symbol/:timeframe/history')
  @ApiOperation({ summary: 'Historial de regímenes detectados' })
  history(
    @Param('symbol') symbol: string,
    @Param('timeframe') timeframe: string,
    @Query('limit') limit?: string,
  ) {
    return this.regimes.history(symbol, timeframe, limit ? Number(limit) : 100);
  }
}
