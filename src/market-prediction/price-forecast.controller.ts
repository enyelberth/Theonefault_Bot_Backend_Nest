import { BadRequestException, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PriceForecastService } from './price-forecast.service';

@ApiTags('market-prediction')
@Controller('market-prediction')
export class PriceForecastController {
  constructor(private readonly forecasts: PriceForecastService) {}

  @Get('forecast')
  @ApiOperation({
    summary:
      'Forecast de precio (AR+GARCH) a horizonBars velas, usando el histórico de Candle',
  })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiQuery({ name: 'timeframe', required: true })
  @ApiQuery({ name: 'horizonBars', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  forecast(
    @Query('symbol') symbol?: string,
    @Query('timeframe') timeframe?: string,
    @Query('horizonBars') horizonBars?: string,
    @Query('limit') limit?: string,
  ) {
    if (!symbol) throw new BadRequestException('symbol required');
    if (!timeframe) throw new BadRequestException('timeframe required');
    return this.forecasts.current({
      symbol,
      timeframe,
      horizonBars: horizonBars === undefined ? undefined : Number(horizonBars),
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'Snapshots de forecast persistidos para symbol/timeframe' })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiQuery({ name: 'timeframe', required: true })
  @ApiQuery({ name: 'horizonBars', required: false, type: 'number' })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  history(
    @Query('symbol') symbol?: string,
    @Query('timeframe') timeframe?: string,
    @Query('horizonBars') horizonBars?: string,
    @Query('limit') limit?: string,
  ) {
    if (!symbol) throw new BadRequestException('symbol required');
    if (!timeframe) throw new BadRequestException('timeframe required');
    return this.forecasts.history(
      symbol,
      timeframe,
      horizonBars === undefined ? undefined : Number(horizonBars),
      limit === undefined ? undefined : Number(limit),
    );
  }

  @Post('evaluate')
  @ApiOperation({
    summary:
      'Validación walk-forward: completa realizedPrice de snapshots vencidos y devuelve MAE/RMSE/accuracy direccional',
  })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiQuery({ name: 'timeframe', required: true })
  @ApiQuery({ name: 'horizonBars', required: true, type: 'number' })
  evaluate(
    @Query('symbol') symbol?: string,
    @Query('timeframe') timeframe?: string,
    @Query('horizonBars') horizonBars?: string,
  ) {
    if (!symbol) throw new BadRequestException('symbol required');
    if (!timeframe) throw new BadRequestException('timeframe required');
    if (!horizonBars) throw new BadRequestException('horizonBars required');
    return this.forecasts.evaluateAccuracy(symbol, timeframe, Number(horizonBars));
  }
}
