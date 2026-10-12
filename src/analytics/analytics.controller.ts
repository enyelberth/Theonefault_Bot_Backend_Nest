import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsService, type AnalyticsQuery } from './analytics.service';
import type { AnalyticsGroupBy } from './analytics.types';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Métricas unificadas de operaciones cerradas' })
  summary(@Query() query: AnalyticsQuery) {
    return this.analytics.summary(this.analytics.parseFilters(query));
  }

  @Get('breakdown')
  @ApiOperation({
    summary: 'Métricas agrupadas por estrategia, símbolo, bot o modo',
  })
  @ApiQuery({
    name: 'groupBy',
    enum: ['strategy', 'symbol', 'run', 'mode', 'regime'],
    required: true,
  })
  breakdown(@Query() query: AnalyticsQuery & { groupBy?: string }) {
    const allowed: AnalyticsGroupBy[] = [
      'strategy',
      'symbol',
      'run',
      'mode',
      'regime',
    ];
    if (
      !query.groupBy ||
      !allowed.includes(query.groupBy as AnalyticsGroupBy)
    ) {
      throw new BadRequestException(
        'groupBy must be strategy, symbol, run, mode or regime',
      );
    }
    const { groupBy, ...filterQuery } = query;
    return this.analytics.breakdown(
      this.analytics.parseFilters(filterQuery),
      groupBy as AnalyticsGroupBy,
    );
  }

  @Get('equity-curve')
  @ApiOperation({ summary: 'Curva acumulada de capital y drawdown' })
  equityCurve(@Query() query: AnalyticsQuery) {
    return this.analytics.equityCurve(this.analytics.parseFilters(query));
  }

  @Get('drawdown')
  @ApiOperation({ summary: 'Periodos bajo el máximo de capital' })
  drawdown(@Query() query: AnalyticsQuery) {
    return this.analytics.drawdown(this.analytics.parseFilters(query));
  }

  @Get('trades')
  @ApiOperation({
    summary: 'Operaciones normalizadas utilizadas por la analítica',
  })
  trades(@Query() query: AnalyticsQuery & { limit?: string; offset?: string }) {
    const { limit, offset, ...filterQuery } = query;
    return this.analytics.trades(
      this.analytics.parseFilters(filterQuery),
      limit === undefined ? 100 : Number(limit),
      offset === undefined ? 0 : Number(offset),
    );
  }

  @Get('time-of-day')
  @ApiOperation({
    summary: 'Heatmap horas UTC · opcional groupBy symbol|strategy',
  })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['symbol', 'strategy'] })
  timeOfDay(@Query() query: AnalyticsQuery & { groupBy?: string }) {
    const allowed = ['symbol', 'strategy'] as const;
    if (
      query.groupBy &&
      !allowed.includes(query.groupBy as (typeof allowed)[number])
    ) {
      throw new BadRequestException('groupBy must be symbol or strategy');
    }
    const { groupBy, ...filterQuery } = query;
    return this.analytics.timeOfDay(
      this.analytics.parseFilters(filterQuery),
      groupBy as 'symbol' | 'strategy' | undefined,
    );
  }

  @Get('day-of-week')
  @ApiOperation({ summary: 'PnL/winRate por día semana UTC' })
  dayOfWeek(@Query() query: AnalyticsQuery) {
    return this.analytics.dayOfWeek(this.analytics.parseFilters(query));
  }

  @Get('sizing-history')
  @ApiOperation({ summary: 'Distribución tamaños posición desde traces' })
  @ApiQuery({ name: 'runId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: 'number' })
  sizingHistory(
    @Query('runId') runId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (
      parsedLimit !== undefined &&
      (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 1000)
    ) {
      throw new BadRequestException('limit must be 1..1000');
    }
    return this.analytics.sizingHistory({
      runId: runId?.trim() || undefined,
      limit: parsedLimit,
    });
  }

  @Get('holding-time')
  @ApiOperation({ summary: 'Distribución duración trades + edge por bucket' })
  holdingTime(@Query() query: AnalyticsQuery) {
    return this.analytics.holdingTime(this.analytics.parseFilters(query));
  }

  @Get('rolling-metrics')
  @ApiOperation({ summary: 'Sharpe/Sortino/winRate rolling last N trades' })
  @ApiQuery({ name: 'window', required: false, type: 'number' })
  rollingMetrics(@Query() query: AnalyticsQuery & { window?: string }) {
    const { window, ...filterQuery } = query;
    const w = window === undefined ? 50 : Number(window);
    if (!Number.isInteger(w) || w < 5 || w > 500) {
      throw new BadRequestException('window must be 5..500');
    }
    return this.analytics.rollingMetrics(
      this.analytics.parseFilters(filterQuery),
      w,
    );
  }

  @Get('drawdown-recovery')
  @ApiOperation({
    summary: 'Historial drawdowns con tiempo recovery + distribución streaks',
  })
  drawdownRecovery(@Query() query: AnalyticsQuery) {
    return this.analytics.drawdownRecovery(this.analytics.parseFilters(query));
  }

  @Get('attribution')
  @ApiOperation({ summary: 'Descompone pnl en price / slippage / fees' })
  @ApiQuery({
    name: 'groupBy',
    required: false,
    enum: ['symbol', 'strategy', 'run'],
  })
  attribution(@Query() query: AnalyticsQuery & { groupBy?: string }) {
    const allowed = ['symbol', 'strategy', 'run'] as const;
    if (
      query.groupBy &&
      !allowed.includes(query.groupBy as (typeof allowed)[number])
    ) {
      throw new BadRequestException('groupBy must be symbol, strategy or run');
    }
    const { groupBy, ...filterQuery } = query;
    return this.analytics.attribution(
      this.analytics.parseFilters(filterQuery),
      groupBy as 'symbol' | 'strategy' | 'run' | undefined,
    );
  }

  @Get('fees-breakdown')
  @ApiOperation({ summary: 'Fees por símbolo, feeBps, % del gross' })
  feesBreakdown(@Query() query: AnalyticsQuery) {
    return this.analytics.feesBreakdown(this.analytics.parseFilters(query));
  }

  @Get('open-positions')
  @ApiOperation({ summary: 'Posiciones abiertas con unrealized PnL + R' })
  @ApiQuery({ name: 'ownerId', required: false, type: 'number' })
  openPositions(@Query('ownerId') ownerId?: string) {
    let parsed: number | undefined;
    if (ownerId !== undefined) {
      const n = Number(ownerId);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException('ownerId must be positive integer');
      }
      parsed = n;
    }
    return this.analytics.openPositions({ ownerId: parsed });
  }

  @Get('system-health')
  @ApiOperation({
    summary: 'Salud sistema: DB, crons, alertas, runners activos',
  })
  systemHealth() {
    return this.analytics.systemHealth();
  }

  @Get('runner-correlation')
  @ApiOperation({
    summary: 'Correlación Pearson entre equity de runners (cross-runner)',
  })
  @ApiQuery({ name: 'ownerId', required: false, type: 'number' })
  @ApiQuery({ name: 'hoursBack', required: false, type: 'number' })
  @ApiQuery({ name: 'bucketMinutes', required: false, type: 'number' })
  runnerCorrelation(
    @Query('ownerId') ownerId?: string,
    @Query('hoursBack') hoursBack?: string,
    @Query('bucketMinutes') bucketMinutes?: string,
  ) {
    const numOrUndef = (v: string | undefined, name: string) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0)
        throw new BadRequestException(`${name} invalid`);
      return n;
    };
    return this.analytics.runnerCorrelation({
      ownerId: numOrUndef(ownerId, 'ownerId'),
      hoursBack: numOrUndef(hoursBack, 'hoursBack'),
      bucketMinutes: numOrUndef(bucketMinutes, 'bucketMinutes'),
    });
  }

  @Get('portfolio-exposure')
  @ApiOperation({ summary: 'Exposición agregada por asset y runner' })
  @ApiQuery({ name: 'ownerId', required: false, type: 'number' })
  portfolioExposure(@Query('ownerId') ownerId?: string) {
    let parsed: number | undefined;
    if (ownerId !== undefined) {
      const n = Number(ownerId);
      if (!Number.isInteger(n) || n <= 0) {
        throw new BadRequestException('ownerId must be positive integer');
      }
      parsed = n;
    }
    return this.analytics.portfolioExposure({ ownerId: parsed });
  }

  @Get('rollup')
  @ApiOperation({ summary: 'Rollup por día/semana/mes con drawdown acumulado' })
  @ApiQuery({ name: 'period', required: true, enum: ['day', 'week', 'month'] })
  rollup(@Query() query: AnalyticsQuery & { period?: string }) {
    const allowed = ['day', 'week', 'month'] as const;
    if (
      !query.period ||
      !allowed.includes(query.period as (typeof allowed)[number])
    ) {
      throw new BadRequestException('period must be day, week or month');
    }
    const { period, ...filterQuery } = query;
    return this.analytics.rollup({
      filters: this.analytics.parseFilters(filterQuery),
      period: period as 'day' | 'week' | 'month',
    });
  }

  @Get('kelly-suggestion')
  @ApiOperation({
    summary: 'Sugerencia Kelly (winRate + winLossRatio históricos)',
  })
  @ApiQuery({ name: 'strategyId', required: true })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['real', 'paper'] })
  @ApiQuery({ name: 'fraction', required: false, type: 'number' })
  @ApiQuery({ name: 'cap', required: false, type: 'number' })
  @ApiQuery({ name: 'minTrades', required: false, type: 'number' })
  kellySuggestion(
    @Query('strategyId') strategyId?: string,
    @Query('symbol') symbol?: string,
    @Query('mode') mode?: string,
    @Query('fraction') fraction?: string,
    @Query('cap') cap?: string,
    @Query('minTrades') minTrades?: string,
  ) {
    if (!strategyId) throw new BadRequestException('strategyId required');
    if (mode && mode !== 'real' && mode !== 'paper') {
      throw new BadRequestException('mode must be real or paper');
    }
    const numOrUndef = (v: string | undefined, name: string) => {
      if (v === undefined) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new BadRequestException(`${name} invalid`);
      return n;
    };
    return this.analytics.kellySuggestion({
      strategyId,
      symbol: symbol?.trim().toUpperCase() || undefined,
      mode: mode as 'real' | 'paper' | undefined,
      fraction: numOrUndef(fraction, 'fraction'),
      cap: numOrUndef(cap, 'cap'),
      minTrades: numOrUndef(minTrades, 'minTrades'),
    });
  }

  @Get('compare-modes')
  @ApiOperation({ summary: 'Compara métricas backtest vs paper vs real' })
  @ApiQuery({ name: 'strategyId', required: true })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'ownerId', required: false, type: 'number' })
  compareModes(
    @Query('strategyId') strategyId?: string,
    @Query('symbol') symbol?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    if (!strategyId) throw new BadRequestException('strategyId required');
    const parsedOwner = ownerId === undefined ? undefined : Number(ownerId);
    if (
      parsedOwner !== undefined &&
      (!Number.isInteger(parsedOwner) || parsedOwner <= 0)
    ) {
      throw new BadRequestException('ownerId must be positive integer');
    }
    return this.analytics.compareModes({
      strategyId,
      symbol: symbol?.trim().toUpperCase() || undefined,
      ownerId: parsedOwner,
    });
  }

  @Get('statement')
  @ApiOperation({
    summary:
      'Estado de cuenta: balance por moneda, ledger de CapitalEvent y trades con fee/pnl bruto-neto',
  })
  statement(@Query() query: AnalyticsQuery) {
    return this.analytics.statement(this.analytics.parseFilters(query));
  }

  @Get('statement.csv')
  @ApiOperation({ summary: 'Estado de cuenta (trades) exportado a CSV' })
  async statementCsv(
    @Query() query: AnalyticsQuery,
    @Res() res: Response,
  ) {
    const csv = await this.analytics.statementCsv(
      this.analytics.parseFilters(query),
    );
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header(
      'Content-Disposition',
      'attachment; filename="statement.csv"',
    );
    res.send(csv);
  }

  @Get('execution')
  @ApiOperation({ summary: 'Costos, slippage, spread y latencia de ejecución' })
  execution(@Query() query: AnalyticsQuery & { groupBy?: string }) {
    const { groupBy, ...filterQuery } = query;
    const allowed: AnalyticsGroupBy[] = ['strategy', 'symbol', 'run', 'mode'];
    if (groupBy && !allowed.includes(groupBy as AnalyticsGroupBy)) {
      throw new BadRequestException(
        'groupBy must be strategy, symbol, run or mode',
      );
    }
    return this.analytics.execution(
      this.analytics.parseFilters(filterQuery),
      groupBy as AnalyticsGroupBy | undefined,
    );
  }
}
