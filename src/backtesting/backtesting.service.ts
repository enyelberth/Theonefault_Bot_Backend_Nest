import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BacktestStatus, Prisma, PrismaClient } from '@prisma/client';
import { CandleLoader } from './candle-loader';
import { ExchangeFactory } from '../exchanges/exchange.factory';
import { StrategyRegistry } from '../strategies/v2/registry/strategy-registry';
import { runBacktest } from './engine/simulator';
import { DEFAULT_FEES, FeesConfig } from './engine/fees';
import type { Candle, Timeframe } from '../exchanges/domain';
import type { RunBacktestDto } from './dto/run-backtest.dto';
import { DEFAULT_EXTRA_TIMEFRAMES } from '../confluence/confluence.service';

@Injectable()
export class BacktestingService {
  private readonly logger = new Logger(BacktestingService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: StrategyRegistry,
    private readonly candleLoader: CandleLoader,
    private readonly exchanges: ExchangeFactory,
  ) {}

  async run(dto: RunBacktestDto) {
    if (!this.registry.has(dto.strategyId)) {
      throw new NotFoundException(`Strategy "${dto.strategyId}" not found`);
    }
    const startTime = new Date(dto.startTime).getTime();
    const endTime = new Date(dto.endTime).getTime();
    if (endTime <= startTime)
      throw new BadRequestException('endTime must be > startTime');

    const run = await this.prisma.backtestRun.create({
      data: {
        strategyId: dto.strategyId,
        exchange: 'binance',
        symbol: dto.symbol,
        timeframe: dto.timeframe,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        initialQuote: new Prisma.Decimal(dto.initialQuote),
        config: dto.config as Prisma.InputJsonValue,
        fees: (dto.fees ?? DEFAULT_FEES) as unknown as Prisma.InputJsonValue,
        status: BacktestStatus.RUNNING,
        createdBy: dto.createdBy,
      },
    });

    try {
      const exchange = this.exchanges.get('binance');
      const strategy = this.registry.create(dto.strategyId);
      const timeframe = dto.timeframe as Timeframe;
      const candles = await this.candleLoader.loadRange({
        symbol: dto.symbol,
        timeframe,
        startTime,
        endTime,
      });
      if (candles.length === 0) throw new Error('No candles loaded for range');

      const extraTimeframeCandles = await this.loadExtraTimeframeCandles(
        dto.symbol,
        dto.config,
        startTime,
        endTime,
      );

      const fees: FeesConfig = { ...DEFAULT_FEES, ...(dto.fees ?? {}) };
      const result = await runBacktest({
        strategy,
        strategyId: dto.strategyId,
        config: dto.config,
        candles,
        symbol: dto.symbol,
        timeframe,
        initialQuote: dto.initialQuote,
        exchange,
        fees,
        warmupBars: dto.warmupBars ?? 0,
        extraTimeframeCandles,
      });

      const m = result.metrics;
      const updated = await this.prisma.backtestRun.update({
        where: { id: run.id },
        data: {
          status: BacktestStatus.COMPLETED,
          completedAt: new Date(),
          finalQuote: new Prisma.Decimal(m.finalQuote),
          totalTrades: m.totalTrades,
          winningTrades: m.winningTrades,
          losingTrades: m.losingTrades,
          winRate: finiteOrNull(m.winRate),
          profitFactor: finiteOrNull(m.profitFactor),
          sharpeRatio: finiteOrNull(m.sharpeRatio),
          sortinoRatio: finiteOrNull(m.sortinoRatio),
          maxDrawdownPct: finiteOrNull(m.maxDrawdownPct),
          totalReturnPct: finiteOrNull(m.totalReturnPct),
          expectancy: finiteOrNull(m.expectancy),
          metrics: sanitizeJson(m) as unknown as Prisma.InputJsonValue,
          equityCurve: result.equityCurve as unknown as Prisma.InputJsonValue,
        },
      });

      if (result.trades.length > 0) {
        await this.prisma.backtestTrade.createMany({
          data: result.trades.map((t) => ({
            backtestRunId: run.id,
            side: t.side,
            entryTime: new Date(t.entryTime),
            exitTime: new Date(t.exitTime),
            entryPrice: new Prisma.Decimal(t.entryPrice),
            exitPrice: new Prisma.Decimal(t.exitPrice),
            quantity: new Prisma.Decimal(t.quantity),
            pnl: new Prisma.Decimal(t.pnl),
            pnlPct: new Prisma.Decimal(t.pnlPct),
            fees: new Prisma.Decimal(t.fees),
            reason: t.reason,
            bars: t.bars,
          })),
        });
      }

      return {
        run: updated,
        metrics: m,
        tradesCount: result.trades.length,
        filteredSignals: result.filteredSignals,
      };
    } catch (err: any) {
      this.logger.error(`Backtest ${run.id} failed: ${err.message}`);
      await this.prisma.backtestRun.update({
        where: { id: run.id },
        data: {
          status: BacktestStatus.FAILED,
          errorMessage: err.message,
          completedAt: new Date(),
        },
      });
      throw err;
    }
  }

  async list(limit = 20) {
    return this.prisma.backtestRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async get(id: number) {
    const run = await this.prisma.backtestRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException(`BacktestRun ${id} not found`);
    return run;
  }

  async getTrades(id: number) {
    return this.prisma.backtestTrade.findMany({
      where: { backtestRunId: id },
      orderBy: { exitTime: 'asc' },
    });
  }

  listStrategies() {
    return this.registry.list();
  }

  /**
   * Precarga, para todo el rango del backtest, las velas de los timeframes
   * extra que config.multiTimeframe y/o config.confluenceFilter van a
   * necesitar -- unión deduplicada de ambos, cargada una sola vez (no por
   * barra). Si ninguna de las dos claves está habilitada, no carga nada.
   */
  private async loadExtraTimeframeCandles(
    symbol: string,
    config: Record<string, unknown>,
    startTime: number,
    endTime: number,
  ): Promise<Record<string, Candle[]>> {
    const timeframes = new Set<string>();
    const mtf = config.multiTimeframe as
      | { enabled?: boolean; contexts?: Array<{ timeframe: string }> }
      | undefined;
    if (mtf?.enabled) {
      for (const c of mtf.contexts ?? []) timeframes.add(c.timeframe);
    }
    const confluenceFilter = config.confluenceFilter as
      | { enabled?: boolean; extraTimeframes?: Array<{ timeframe: string }> }
      | undefined;
    if (confluenceFilter?.enabled) {
      const extras = confluenceFilter.extraTimeframes ?? DEFAULT_EXTRA_TIMEFRAMES;
      for (const c of extras) timeframes.add(c.timeframe);
    }
    if (timeframes.size === 0) return {};

    const out: Record<string, Candle[]> = {};
    await Promise.all(
      Array.from(timeframes).map(async (tf) => {
        out[tf] = await this.candleLoader.loadRange({
          symbol,
          timeframe: tf as Timeframe,
          startTime,
          endTime,
        });
      }),
    );
    return out;
  }
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

function sanitizeJson<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_k, v) =>
      typeof v === 'number' && !Number.isFinite(v) ? null : v,
    ),
  );
}
