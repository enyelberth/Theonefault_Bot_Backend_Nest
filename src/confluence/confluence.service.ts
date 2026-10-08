import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Candle } from '../exchanges/domain';
import { MarketDataService } from '../market-data/market-data.service';
import { MarketRegimeService } from '../market-regime/market-regime.service';
import { evaluateTimeframeAlignment } from '../market-regime/multi-timeframe';
import { IndicatorsService } from '../indicators/indicators.service';
import { computeConfluence } from './confluence.calculator';
import type { ConfluenceConfig, ConfluenceResult } from './confluence.types';

const DEFAULT_EXTRA_TIMEFRAMES = [
  { timeframe: '1h', weight: 2 },
  { timeframe: '4h', weight: 3 },
];

@Injectable()
export class ConfluenceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly marketData: MarketDataService,
    private readonly marketRegime: MarketRegimeService,
    private readonly indicators: IndicatorsService,
  ) {}

  private async loadDomainCandles(
    symbol: string,
    timeframe: string,
    limit: number,
  ): Promise<Candle[]> {
    const rows = await this.marketData.getCandles({
      symbol,
      interval: timeframe,
      limit,
    });
    return rows.map((row) => ({
      symbol: row.symbol,
      timeframe: row.interval as Candle['timeframe'],
      openTime: row.openTime.getTime(),
      closeTime: row.closeTime.getTime(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      closed: true,
    }));
  }

  async compute(
    symbol: string,
    timeframe: string,
    config: ConfluenceConfig = {},
  ): Promise<ConfluenceResult> {
    const upperSymbol = symbol.toUpperCase();

    const primaryCandles = await this.loadDomainCandles(
      upperSymbol,
      timeframe,
      300,
    );
    const regime = await this.marketRegime.detectAndStore(
      upperSymbol,
      timeframe,
      primaryCandles,
    );

    const extras = config.extraTimeframes ?? DEFAULT_EXTRA_TIMEFRAMES;
    const contexts = [{ timeframe, weight: 1, regime }];
    for (const extra of extras.slice(0, 4)) {
      const candles = await this.loadDomainCandles(
        upperSymbol,
        extra.timeframe,
        300,
      );
      const extraRegime = await this.marketRegime.detectAndStore(
        upperSymbol,
        extra.timeframe,
        candles,
      );
      contexts.push({
        timeframe: extra.timeframe,
        weight: extra.weight ?? 1,
        regime: extraRegime,
      });
    }
    // Side 'BUY' da directamente el score de sesgo alcista 0-100 que
    // necesitamos (BEARISH no es más que 100 - score); ver
    // evaluateTimeframeAlignment para la convención de signo.
    const mtf = evaluateTimeframeAlignment('BUY', contexts, 50, 0, true);

    const indicatorSnapshot = await this.indicators.getSnapshot(
      upperSymbol,
      timeframe,
    );

    const result = computeConfluence(regime, mtf, indicatorSnapshot, config);

    if (primaryCandles.length > 0) {
      await this.prisma.confluenceSnapshot.upsert({
        where: {
          symbol_timeframe_candleCloseTime: {
            symbol: result.symbol,
            timeframe: result.timeframe,
            candleCloseTime: new Date(result.candleCloseTime),
          },
        },
        create: this.toPersistence(result),
        update: this.toPersistence(result),
      });
    }

    return result;
  }

  async history(symbol: string, timeframe: string, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 500',
      );
    }
    return this.prisma.confluenceSnapshot.findMany({
      where: { symbol: symbol.toUpperCase(), timeframe },
      orderBy: { candleCloseTime: 'desc' },
      take: limit,
    });
  }

  private toPersistence(result: ConfluenceResult) {
    return {
      symbol: result.symbol,
      timeframe: result.timeframe,
      candleCloseTime: new Date(result.candleCloseTime),
      score: result.score,
      bias: result.bias,
      confidence: result.confidence,
      regimeScore: result.regimeScore,
      mtfScore: result.mtfScore,
      momentumScore: result.momentumScore,
      breakdown: result.breakdown as unknown as Prisma.InputJsonValue,
    };
  }
}
