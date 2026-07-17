import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BinanceAdapter } from '../exchanges/adapters/binance.adapter';
import type { Candle, Timeframe } from '../exchanges/domain';

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '2h': 2 * 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '8h': 8 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '1w': 7 * 24 * 60 * 60_000,
  '1M': 30 * 24 * 60 * 60_000,
};

export function timeframeToMs(tf: Timeframe): number {
  return TIMEFRAME_MS[tf];
}

export interface LoadRangeParams {
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  useCache?: boolean;
}

@Injectable()
export class CandleLoader {
  private readonly logger = new Logger(CandleLoader.name);
  private readonly BATCH = 1000;

  constructor(
    private readonly binance: BinanceAdapter,
    private readonly prisma: PrismaClient,
  ) {}

  async loadRange(params: LoadRangeParams): Promise<Candle[]> {
    const { symbol, timeframe, startTime, endTime, useCache = true } = params;
    if (endTime <= startTime) return [];

    if (useCache) {
      const cached = await this.readCache(symbol, timeframe, startTime, endTime);
      const expected = this.expectedCount(timeframe, startTime, endTime);
      if (cached.length >= expected * 0.99) {
        this.logger.log(`cache hit ${symbol} ${timeframe} ${cached.length}/${expected}`);
        return cached;
      }
    }

    const fetched = await this.fetchFromExchange(symbol, timeframe, startTime, endTime);
    if (useCache && fetched.length > 0) {
      await this.writeCache(fetched);
    }
    return fetched;
  }

  private expectedCount(tf: Timeframe, start: number, end: number): number {
    return Math.ceil((end - start) / timeframeToMs(tf));
  }

  private async fetchFromExchange(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Promise<Candle[]> {
    const step = timeframeToMs(timeframe);
    const out: Candle[] = [];
    let cursor = startTime;
    while (cursor < endTime) {
      const chunkEnd = Math.min(cursor + step * this.BATCH, endTime);
      const batch = await this.binance.getCandles({
        symbol,
        timeframe,
        limit: this.BATCH,
      });
      const filtered = batch.filter(
        (c) => c.openTime >= cursor && c.openTime < chunkEnd,
      );
      if (filtered.length === 0) break;
      out.push(...filtered);
      const last = batch[batch.length - 1];
      const nextCursor = last.openTime + step;
      if (nextCursor <= cursor) break;
      cursor = nextCursor;
    }
    return out
      .sort((a, b) => a.openTime - b.openTime)
      .filter((c, i, arr) => i === 0 || c.openTime !== arr[i - 1].openTime);
  }

  private async readCache(
    symbol: string,
    timeframe: Timeframe,
    startTime: number,
    endTime: number,
  ): Promise<Candle[]> {
    const rows = await this.prisma.candle.findMany({
      where: {
        symbol,
        interval: timeframe,
        openTime: { gte: new Date(startTime), lt: new Date(endTime) },
      },
      orderBy: { openTime: 'asc' },
    });
    return rows.map((r) => ({
      symbol: r.symbol,
      timeframe: r.interval as Timeframe,
      openTime: r.openTime.getTime(),
      closeTime: r.closeTime.getTime(),
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      trades: r.trades ?? undefined,
      closed: true,
    }));
  }

  private async writeCache(candles: Candle[]): Promise<void> {
    if (candles.length === 0) return;
    const rows = candles.map((c) => ({
      symbol: c.symbol,
      interval: c.timeframe,
      openTime: new Date(c.openTime),
      closeTime: new Date(c.closeTime),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      trades: c.trades ?? null,
    }));
    for (const row of rows) {
      await this.prisma.candle
        .upsert({
          where: {
            symbol_interval_openTime: {
              symbol: row.symbol,
              interval: row.interval,
              openTime: row.openTime,
            },
          },
          create: row,
          update: {},
        })
        .catch((err) => this.logger.warn(`cache write failed: ${err.message}`));
    }
  }
}
