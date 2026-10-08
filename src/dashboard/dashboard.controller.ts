import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('stats')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Snapshot completo bots activos + global' })
  async getDashboard() {
    const [bots, global] = await Promise.all([
      this.dashboard.getActiveBotSummaries(),
      this.dashboard.getGlobalStats(),
    ]);
    return { ts: new Date().toISOString(), global, bots };
  }

  @Get('global')
  @ApiOperation({ summary: 'Métricas globales' })
  getGlobal() {
    return this.dashboard.getGlobalStats();
  }

  @Get('by-symbol')
  @ApiOperation({ summary: 'PnL agregado por par' })
  bySymbol() {
    return this.dashboard.aggregateBy('symbol');
  }

  @Get('by-strategy')
  @ApiOperation({ summary: 'PnL agregado por tipo estrategia' })
  byStrategy() {
    return this.dashboard.aggregateBy('strategyType');
  }

  @Get('by-hour')
  @ApiOperation({
    summary: 'Distribución trades y PnL por hora (últimas N horas)',
  })
  @ApiQuery({ name: 'hours', required: false, type: 'number', example: 24 })
  byHour(@Query('hours') hours?: string) {
    return this.dashboard.aggregateByHour(hours ? Number(hours) : 24);
  }

  @Get('drawdown/:botRunId')
  @ApiOperation({ summary: 'Max drawdown + Sharpe por BotRun' })
  @ApiParam({ name: 'botRunId', type: 'number', example: 1 })
  drawdown(@Param('botRunId') botRunId: string) {
    return this.dashboard.getDrawdown(Number(botRunId));
  }

  @Get('analytics/strategy-performance')
  @ApiOperation({
    summary: 'Métricas ricas por strategyId: PF, expectancy, Sharpe, avg hold',
  })
  strategyPerformance() {
    return this.dashboard.strategyPerformance();
  }

  @Get('analytics/best-hours')
  @ApiOperation({ summary: 'PnL, winRate y avgPnl por hora UTC (0-23)' })
  bestHours() {
    return this.dashboard.bestHoursOfDay();
  }

  @Get('analytics/excursion')
  @ApiOperation({ summary: 'MAE/MFE agregado por estrategia + edge ratio' })
  excursion() {
    return this.dashboard.excursionStats();
  }

  @Get('analytics/symbol-correlation')
  @ApiOperation({
    summary: 'Matriz correlación Pearson de retornos diarios por símbolo',
  })
  @ApiQuery({ name: 'days', required: false, type: 'number', example: 30 })
  symbolCorrelation(@Query('days') days?: string) {
    return this.dashboard.symbolReturnCorrelation(days ? Number(days) : 30);
  }
}
