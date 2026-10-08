import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { Candle } from '../exchanges/domain';
import type { IExchange } from '../exchanges/exchange.interface';
import {
  evaluateTimeframeAlignment,
  type MultiTimeframeConfig,
} from './multi-timeframe';
import { detectMarketRegime } from './market-regime.detector';
import type {
  MarketRegimeResult,
  RegimeFilterConfig,
} from './market-regime.types';

@Injectable()
export class MarketRegimeService {
  constructor(private readonly prisma: PrismaClient) {}

  detect(symbol: string, timeframe: string, candles: ReadonlyArray<Candle>) {
    return detectMarketRegime(symbol, timeframe, candles);
  }

  async detectAndStore(
    symbol: string,
    timeframe: string,
    candles: ReadonlyArray<Candle>,
  ): Promise<MarketRegimeResult> {
    const result = this.detect(symbol, timeframe, candles);
    if (candles.length === 0) return result;
    await this.prisma.marketRegimeSnapshot.upsert({
      where: {
        symbol_timeframe_candleCloseTime: {
          symbol,
          timeframe,
          candleCloseTime: new Date(result.candleCloseTime),
        },
      },
      create: this.toPersistence(result),
      update: this.toPersistence(result),
    });
    return result;
  }

  allows(result: MarketRegimeResult, config?: RegimeFilterConfig): boolean {
    if (!config?.enabled) return true;
    if (result.trend === 'UNKNOWN') return config.allowUnknown === true;
    if (
      config.minConfidence !== undefined &&
      result.confidence < config.minConfidence
    ) {
      return false;
    }
    if (
      config.allowedRegimes?.length &&
      !config.allowedRegimes.includes(result.regime)
    ) {
      return false;
    }
    if (
      config.allowedTrends?.length &&
      !config.allowedTrends.includes(result.trend)
    ) {
      return false;
    }
    if (config.blockedVolatility?.includes(result.volatility)) return false;
    return true;
  }

  async current(symbol: string, timeframe: string, limit = 100) {
    if (!Number.isInteger(limit) || limit < 50 || limit > 500) {
      throw new BadRequestException(
        'limit must be an integer between 50 and 500',
      );
    }
    const records = await this.prisma.candle.findMany({
      where: { symbol: symbol.toUpperCase(), interval: timeframe },
      orderBy: { closeTime: 'desc' },
      take: limit,
    });
    const candles: Candle[] = records.reverse().map((record) => ({
      symbol: record.symbol,
      timeframe: record.interval as Candle['timeframe'],
      openTime: record.openTime.getTime(),
      closeTime: record.closeTime.getTime(),
      open: record.open,
      high: record.high,
      low: record.low,
      close: record.close,
      volume: record.volume,
      closed: true,
    }));
    return this.detectAndStore(symbol.toUpperCase(), timeframe, candles);
  }

  async history(symbol: string, timeframe: string, limit = 100) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 500',
      );
    }
    return this.prisma.marketRegimeSnapshot.findMany({
      where: { symbol: symbol.toUpperCase(), timeframe },
      orderBy: { candleCloseTime: 'desc' },
      take: limit,
    });
  }

  async evaluateTimeframes(input: {
    botRunnerRunId: number;
    correlationId: string;
    symbol: string;
    primaryTimeframe: string;
    side: 'BUY' | 'SELL';
    primary: MarketRegimeResult;
    config: MultiTimeframeConfig;
    exchange: IExchange;
  }) {
    const contexts = [
      { timeframe: input.primaryTimeframe, weight: 1, regime: input.primary },
    ];
    for (const item of input.config.contexts.slice(0, 4)) {
      const candles = await input.exchange.getCandles({
        symbol: input.symbol,
        timeframe: item.timeframe as Candle['timeframe'],
        limit: Math.max(50, Math.min(input.config.warmupBars ?? 100, 500)),
      });
      const regime = await this.detectAndStore(
        input.symbol,
        item.timeframe,
        candles,
      );
      contexts.push({
        timeframe: item.timeframe,
        weight: item.weight ?? 1,
        regime,
      });
    }
    const result = evaluateTimeframeAlignment(
      input.side,
      contexts,
      input.config.minScore ?? 60,
      input.config.minConfidence ?? 50,
      input.config.allowUnknown ?? false,
    );
    await this.prisma.multiTimeframeEvaluation.upsert({
      where: { correlationId: input.correlationId },
      create: {
        botRunnerRunId: input.botRunnerRunId,
        correlationId: input.correlationId,
        symbol: input.symbol,
        primaryTimeframe: input.primaryTimeframe,
        side: input.side,
        score: result.score,
        aligned: result.aligned,
        contexts: JSON.parse(
          JSON.stringify(result.contexts),
        ) as Prisma.InputJsonValue,
      },
      update: {
        score: result.score,
        aligned: result.aligned,
        contexts: JSON.parse(
          JSON.stringify(result.contexts),
        ) as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  listTimeframeEvaluations(runId: string, limit = 100) {
    return this.prisma.multiTimeframeEvaluation.findMany({
      where: { botRunnerRun: { runId } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  private toPersistence(result: MarketRegimeResult) {
    return {
      symbol: result.symbol,
      timeframe: result.timeframe,
      candleCloseTime: new Date(result.candleCloseTime),
      regime: result.regime,
      trend: result.trend,
      volatility: result.volatility,
      volume: result.volume,
      confidence: result.confidence,
      trendStrengthPct: result.trendStrengthPct,
      atrPct: result.atrPct,
      efficiencyRatio: result.efficiencyRatio,
      volumeRatio: result.volumeRatio,
      indicators: result.indicators as unknown as Prisma.InputJsonValue,
    };
  }
}
