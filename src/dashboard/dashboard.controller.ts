import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/authA/auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('stats')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Public()
  @Get('dashboard')
  @ApiOperation({ summary: 'Snapshot completo bots activos + global' })
  async getDashboard() {
    const [bots, global] = await Promise.all([
      this.dashboard.getActiveBotSummaries(),
      this.dashboard.getGlobalStats(),
    ]);
    return { ts: new Date().toISOString(), global, bots };
  }

  @Public()
  @Get('global')
  @ApiOperation({ summary: 'Métricas globales' })
  getGlobal() {
    return this.dashboard.getGlobalStats();
  }

  @Public()
  @Get('by-symbol')
  @ApiOperation({ summary: 'PnL agregado por par' })
  bySymbol() {
    return this.dashboard.aggregateBy('symbol');
  }

  @Public()
  @Get('by-strategy')
  @ApiOperation({ summary: 'PnL agregado por tipo estrategia' })
  byStrategy() {
    return this.dashboard.aggregateBy('strategyType');
  }

  @Public()
  @Get('by-hour')
  @ApiOperation({ summary: 'Distribución trades y PnL por hora (últimas N horas)' })
  @ApiQuery({ name: 'hours', required: false, type: 'number', example: 24 })
  byHour(@Query('hours') hours?: string) {
    return this.dashboard.aggregateByHour(hours ? Number(hours) : 24);
  }

  @Public()
  @Get('drawdown/:botRunId')
  @ApiOperation({ summary: 'Max drawdown + Sharpe por BotRun' })
  @ApiParam({ name: 'botRunId', type: 'number', example: 1 })
  drawdown(@Param('botRunId') botRunId: string) {
    return this.dashboard.getDrawdown(Number(botRunId));
  }
}
