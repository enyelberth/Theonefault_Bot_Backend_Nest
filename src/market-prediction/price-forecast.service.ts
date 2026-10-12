import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { forecastPrice, PriceForecastOutput } from './price-forecast.calculator';

function timeframeToMs(timeframe: string): number {
  const match = /^(\d+)(m|h|d|w)$/.exec(timeframe);
  if (!match) {
    throw new BadRequestException(`timeframe no reconocido: ${timeframe}`);
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return value * unitMs[match[2]];
}

@Injectable()
export class PriceForecastService {
  private readonly logger = new Logger(PriceForecastService.name);

  constructor(private readonly prisma: PrismaClient) {}

  /** Cálculo puro, sin persistir -- útil para previsualizar sin ensuciar el histórico. */
  compute(
    closes: ReadonlyArray<number>,
    horizonBars: number,
    arOrder?: number,
  ): PriceForecastOutput {
    return forecastPrice({ closes, horizonBars, arOrder });
  }

  /**
   * Lee las últimas `limit` velas cerradas de `symbol`/`timeframe`, calcula
   * el forecast y lo persiste (idempotente por vela: upsert sobre
   * [symbol, timeframe, candleCloseTime, horizonBars]). Mismo patrón que
   * MarketRegimeService.current().
   */
  async current(input: {
    symbol: string;
    timeframe: string;
    horizonBars?: number;
    arOrder?: number;
    limit?: number;
  }) {
    const symbol = input.symbol.toUpperCase();
    const horizonBars = input.horizonBars ?? 1;
    const limit = input.limit ?? 300;
    if (!Number.isInteger(horizonBars) || horizonBars < 1 || horizonBars > 500) {
      throw new BadRequestException('horizonBars debe ser un entero 1..500');
    }
    if (!Number.isInteger(limit) || limit < 120 || limit > 1000) {
      throw new BadRequestException('limit debe ser un entero 120..1000');
    }
    const records = await this.prisma.candle.findMany({
      where: { symbol, interval: input.timeframe },
      orderBy: { closeTime: 'desc' },
      take: limit,
    });
    if (records.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA' as const,
        symbol,
        timeframe: input.timeframe,
        horizonBars,
        candleCloseTime: null,
        forecast: null,
      };
    }
    const ordered = records.slice().reverse();
    const closes = ordered.map((c) => Number(c.close));
    const result = this.compute(closes, horizonBars, input.arOrder);
    const lastCandle = ordered[ordered.length - 1];

    if (result.status === 'OK') {
      await this.prisma.priceForecastSnapshot.upsert({
        where: {
          symbol_timeframe_candleCloseTime_horizonBars: {
            symbol,
            timeframe: input.timeframe,
            candleCloseTime: lastCandle.closeTime,
            horizonBars,
          },
        },
        create: this.toPersistence(symbol, input.timeframe, lastCandle.closeTime, horizonBars, closes[closes.length - 1], result),
        update: this.toPersistence(symbol, input.timeframe, lastCandle.closeTime, horizonBars, closes[closes.length - 1], result),
      });
    }

    return {
      status: result.status,
      symbol,
      timeframe: input.timeframe,
      horizonBars,
      candleCloseTime: lastCandle.closeTime.toISOString(),
      forecast: result,
    };
  }

  async history(symbol: string, timeframe: string, horizonBars?: number, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException('limit debe ser un entero 1..500');
    }
    return this.prisma.priceForecastSnapshot.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe,
        horizonBars,
      },
      orderBy: { candleCloseTime: 'desc' },
      take: limit,
    });
  }

  /**
   * Validación walk-forward: busca snapshots cuyo horizonte ya pasó y que
   * todavía no tienen `realizedPrice`, les asigna el close real de esa
   * vela futura, y devuelve el error agregado (MAE/RMSE/directional
   * accuracy) de TODOS los snapshots ya evaluados -- no solo los nuevos.
   * Sin esto habilitado y revisado, config.priceForecast no debería
   * activarse en real (ver roadmap del CLAUDE.md).
   */
  async evaluateAccuracy(symbol: string, timeframe: string, horizonBars: number) {
    const sym = symbol.toUpperCase();
    const horizonMs = timeframeToMs(timeframe) * horizonBars;
    const pending = await this.prisma.priceForecastSnapshot.findMany({
      where: {
        symbol: sym,
        timeframe,
        horizonBars,
        realizedPrice: null,
        candleCloseTime: { lte: new Date(Date.now() - horizonMs) },
      },
      take: 500,
    });
    let updated = 0;
    for (const snapshot of pending) {
      const targetTime = new Date(snapshot.candleCloseTime.getTime() + horizonMs);
      const realized = await this.prisma.candle.findFirst({
        where: {
          symbol: sym,
          interval: timeframe,
          closeTime: { gte: targetTime },
        },
        orderBy: { closeTime: 'asc' },
      });
      if (!realized) continue;
      await this.prisma.priceForecastSnapshot.update({
        where: { id: snapshot.id },
        data: {
          realizedPrice: realized.close,
          evaluatedAt: new Date(),
        },
      });
      updated += 1;
    }

    return this.aggregateAccuracy(sym, timeframe, horizonBars, updated);
  }

  /**
   * Igual que evaluateAccuracy() pero sin el paso de completar
   * realizedPrice -- solo lee lo que ya está evaluado. Pensada para
   * consultarse en el hot path del bot runner (sizing por confianza) sin
   * cargarle un write de reconciliación a cada señal.
   */
  async accuracySummary(symbol: string, timeframe: string, horizonBars: number) {
    return this.aggregateAccuracy(symbol.toUpperCase(), timeframe, horizonBars, 0);
  }

  private async aggregateAccuracy(
    symbol: string,
    timeframe: string,
    horizonBars: number,
    newlyEvaluated: number,
  ) {
    const evaluated = await this.prisma.priceForecastSnapshot.findMany({
      where: { symbol, timeframe, horizonBars, realizedPrice: { not: null } },
      select: { forecastPrice: true, lastPrice: true, realizedPrice: true },
    });
    if (evaluated.length === 0) {
      return {
        symbol,
        timeframe,
        horizonBars,
        newlyEvaluated,
        sampleSize: 0,
        mae: null,
        rmse: null,
        directionalAccuracyPct: null,
      };
    }
    let absError = 0;
    let sqError = 0;
    let correctDirection = 0;
    for (const row of evaluated) {
      const forecast = Number(row.forecastPrice);
      const last = Number(row.lastPrice);
      const realized = Number(row.realizedPrice);
      const err = realized - forecast;
      absError += Math.abs(err);
      sqError += err * err;
      const forecastDirection = Math.sign(forecast - last);
      const realizedDirection = Math.sign(realized - last);
      if (forecastDirection === realizedDirection || forecastDirection === 0) {
        correctDirection += 1;
      }
    }
    return {
      symbol,
      timeframe,
      horizonBars,
      newlyEvaluated,
      sampleSize: evaluated.length,
      mae: Number((absError / evaluated.length).toFixed(8)),
      rmse: Number(Math.sqrt(sqError / evaluated.length).toFixed(8)),
      directionalAccuracyPct: Number(
        ((correctDirection / evaluated.length) * 100).toFixed(2),
      ),
    };
  }

  private toPersistence(
    symbol: string,
    timeframe: string,
    candleCloseTime: Date,
    horizonBars: number,
    lastPrice: number,
    result: PriceForecastOutput,
  ): Prisma.PriceForecastSnapshotCreateInput {
    return {
      symbol,
      timeframe,
      candleCloseTime,
      horizonBars,
      lastPrice: new Prisma.Decimal(lastPrice),
      forecastPrice: new Prisma.Decimal(result.forecastPrice),
      lowerBound: new Prisma.Decimal(result.lowerBound),
      upperBound: new Prisma.Decimal(result.upperBound),
      confidencePct: result.confidencePct,
      volatilityForecast: new Prisma.Decimal(result.volatilityForecast),
      modelType: result.modelType,
      modelParams: result.modelParams
        ? (JSON.parse(JSON.stringify(result.modelParams)) as Prisma.InputJsonValue)
        : undefined,
      samplesUsed: result.samplesUsed,
    };
  }
}
