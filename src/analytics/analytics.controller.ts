import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthGuard } from 'src/authA/auth.guard';
import { AnalyticsService } from 'src/analytics/analytics.service';

@ApiBearerAuth('BearerAuth')
@UseGuards(AuthGuard)
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Resumen global de trading y contabilidad' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  @ApiQuery({ name: 'baseCurrency', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Resumen obtenido correctamente.' })
  getSummary(
    @Query('accountId') accountId?: string,
    @Query('baseCurrency') baseCurrency?: string,
  ) {
    return this.analyticsService.getSummary(accountId ? Number(accountId) : undefined, baseCurrency);
  }

  @Get('pnl/timeseries')
  @ApiOperation({ summary: 'Serie temporal de ganancias y perdidas realizadas' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  @ApiQuery({ name: 'symbol', required: false, type: String })
  @ApiQuery({ name: 'strategy', required: false, type: String })
  getPnlTimeSeries(
    @Query('granularity') granularity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('symbol') symbol?: string,
    @Query('strategy') strategy?: string,
  ) {
    return this.analyticsService.getPnlTimeSeries(
      granularity,
      from,
      to,
      accountId ? Number(accountId) : undefined,
      symbol,
      strategy,
    );
  }

  @Get('income-expense/timeseries')
  @ApiOperation({ summary: 'Serie temporal de ingresos y egresos contables' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  getIncomeExpense(
    @Query('granularity') granularity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getIncomeExpenseSeries(
      granularity,
      from,
      to,
      accountId ? Number(accountId) : undefined,
    );
  }

  @Get('by-symbol')
  @ApiOperation({ summary: 'PnL por simbolo de trading' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  getBySymbol(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getBySymbol(from, to, accountId ? Number(accountId) : undefined);
  }

  @Get('by-strategy')
  @ApiOperation({ summary: 'PnL por estrategia de trading' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  getByStrategy(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.analyticsService.getByStrategy(from, to, accountId ? Number(accountId) : undefined);
  }

  @Get('risk')
  @ApiOperation({ summary: 'Metricas de riesgo: drawdown, sharpe, sortino, volatilidad' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  @ApiQuery({ name: 'symbol', required: false, type: String })
  @ApiQuery({ name: 'strategy', required: false, type: String })
  getRisk(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('symbol') symbol?: string,
    @Query('strategy') strategy?: string,
  ) {
    return this.analyticsService.getRiskMetrics(
      from,
      to,
      accountId ? Number(accountId) : undefined,
      symbol,
      strategy,
    );
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Payload unico para dashboard con charts y KPIs' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date' })
  @ApiQuery({ name: 'accountId', required: false, type: Number })
  @ApiQuery({ name: 'baseCurrency', required: false, type: String })
  @ApiQuery({ name: 'symbol', required: false, type: String })
  @ApiQuery({ name: 'strategy', required: false, type: String })
  @ApiQuery({ name: 'granularity', required: false, enum: ['day', 'week', 'month'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  getDashboard(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('baseCurrency') baseCurrency?: string,
    @Query('symbol') symbol?: string,
    @Query('strategy') strategy?: string,
    @Query('granularity') granularity?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.analyticsService.getDashboard({
      from,
      to,
      accountId: accountId ? Number(accountId) : undefined,
      baseCurrency,
      symbol,
      strategy,
      granularity,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('dashboard/csv')
  @ApiOperation({ summary: 'Exporta dashboard en CSV' })
  async exportDashboardCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('baseCurrency') baseCurrency?: string,
    @Query('symbol') symbol?: string,
    @Query('strategy') strategy?: string,
    @Query('granularity') granularity?: string,
  ) {
    const csv = await this.analyticsService.exportDashboardCsv({
      from,
      to,
      accountId: accountId ? Number(accountId) : undefined,
      baseCurrency,
      symbol,
      strategy,
      granularity,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analytics-dashboard-${Date.now()}.csv"`);
    res.send(csv);
  }

  @Get('metrics/runtime')
  @ApiOperation({ summary: 'Metricas runtime del servicio' })
  getRuntimeMetrics() {
    return this.analyticsService.getRuntimeMetrics();
  }

  @Get('comparison/periods')
  @ApiOperation({ summary: 'Comparativas por período: hoy vs ayer y semana vs semana anterior' })
  getPeriodComparison(@Query('accountId') accountId?: string) {
    return this.analyticsService.getPeriodComparison(accountId ? Number(accountId) : undefined);
  }

  @Get('benchmark')
  @ApiOperation({ summary: 'Benchmark por cuenta y símbolo' })
  getBenchmark(@Query('accountId') accountId?: string) {
    return this.analyticsService.getBenchmark(accountId ? Number(accountId) : undefined);
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Heatmap de horas y días con mejor rendimiento' })
  getHeatmap(@Query('accountId') accountId?: string) {
    return this.analyticsService.getHeatmap(accountId ? Number(accountId) : undefined);
  }

  @Get('cohorts')
  @ApiOperation({ summary: 'Cohortes de operaciones por setup o tipo de señal' })
  getCohorts(@Query('accountId') accountId?: string) {
    return this.analyticsService.getCohorts(accountId ? Number(accountId) : undefined);
  }

  @Get('drilldown')
  @ApiOperation({ summary: 'Drill-down desde dashboard a órdenes y asientos concretos' })
  getDrilldown(
    @Query('accountId') accountId?: string,
    @Query('symbol') symbol?: string,
  ) {
    return this.analyticsService.getDrilldown(accountId ? Number(accountId) : undefined, symbol);
  }
}
