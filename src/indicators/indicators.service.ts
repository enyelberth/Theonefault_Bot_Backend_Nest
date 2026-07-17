import { Injectable, Logger } from '@nestjs/common';
import { CryptoPrice, PrismaClient } from '@prisma/client';
import { MarketDataService } from 'src/market-data/market-data.service';
import { IndicatorCacheService } from './indicator-cache.service';
import {
  BollingerResult,
  MacdResult,
  TrendResult,
  atr,
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  trend,
  vwap,
} from './math';

export interface IndicatorSnapshot {
  symbol: string;
  interval: string;
  lastClose: number;
  rsi: number | null;
  bollinger: BollingerResult | null;
  macd: MacdResult | null;
  atr: number | null;
  vwap: number | null;
  trend: TrendResult | null;
  emaFast: number | null;
  emaSlow: number | null;
  timestamp: Date;
}

const DEFAULT_TTL_MS = 5000;

@Injectable()
export class IndicatorsService {
  private readonly logger = new Logger(IndicatorsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly marketData: MarketDataService,
    private readonly cache: IndicatorCacheService,
  ) {}

  async createCryptoPrice(data: {
    symbol: string;
    price: number;
    volume?: number;
    timestamp: Date;
  }): Promise<CryptoPrice> {
    return this.prisma.cryptoPrice.create({ data });
  }

  async findPricesBySymbol(symbol: string): Promise<CryptoPrice[]> {
    return this.prisma.cryptoPrice.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
  }

  async findLatestPrice(symbol: string): Promise<CryptoPrice | null> {
    return this.prisma.cryptoPrice.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Carga cierres desde Candle (preferido) o cae a CryptoPrice.
   */
  private async loadCloses(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<{
    closes: number[];
    highs: number[];
    lows: number[];
    volumes: number[];
    fallback: boolean;
  }> {
    const candles = await this.marketData.getCandles({ symbol, interval, limit });
    if (candles.length > 0) {
      const ordered = candles.slice().reverse(); // asc
      return {
        closes: ordered.map((c) => c.close),
        highs: ordered.map((c) => c.high),
        lows: ordered.map((c) => c.low),
        volumes: ordered.map((c) => c.volume),
        fallback: false,
      };
    }
    const prices = await this.prisma.cryptoPrice.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    const ordered = prices.slice().reverse();
    return {
      closes: ordered.map((p) => p.price),
      highs: ordered.map((p) => p.price),
      lows: ordered.map((p) => p.price),
      volumes: ordered.map((p) => p.volume ?? 0),
      fallback: true,
    };
  }

  async getRSI(symbol: string, interval = '1m', period = 14): Promise<number | null> {
    const key = `rsi:${symbol}:${interval}:${period}`;
    const cached = this.cache.get<number>(key);
    if (cached !== null) return cached;

    const { closes } = await this.loadCloses(symbol, interval, Math.max(200, period * 3));
    const v = rsi(closes, period);
    if (v !== null) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getBollinger(
    symbol: string,
    interval = '1m',
    period = 20,
    k = 2,
  ): Promise<BollingerResult | null> {
    const key = `bb:${symbol}:${interval}:${period}:${k}`;
    const cached = this.cache.get<BollingerResult>(key);
    if (cached) return cached;

    const { closes } = await this.loadCloses(symbol, interval, Math.max(200, period * 3));
    const v = bollinger(closes, period, k);
    if (v) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getMACD(
    symbol: string,
    interval = '1m',
    fast = 12,
    slow = 26,
    signalPeriod = 9,
  ): Promise<MacdResult | null> {
    const key = `macd:${symbol}:${interval}:${fast}:${slow}:${signalPeriod}`;
    const cached = this.cache.get<MacdResult>(key);
    if (cached) return cached;

    const { closes } = await this.loadCloses(symbol, interval, Math.max(300, slow * 5));
    const v = macd(closes, fast, slow, signalPeriod);
    if (v) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getATR(symbol: string, interval = '1m', period = 14): Promise<number | null> {
    const key = `atr:${symbol}:${interval}:${period}`;
    const cached = this.cache.get<number>(key);
    if (cached !== null) return cached;

    const { highs, lows, closes, fallback } = await this.loadCloses(
      symbol,
      interval,
      Math.max(200, period * 3),
    );
    if (fallback) return null; // sin high/low reales no tiene sentido
    const v = atr(highs, lows, closes, period);
    if (v !== null) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getVWAP(symbol: string, interval = '1m', lookback = 96): Promise<number | null> {
    const key = `vwap:${symbol}:${interval}:${lookback}`;
    const cached = this.cache.get<number>(key);
    if (cached !== null) return cached;

    const { highs, lows, closes, volumes, fallback } = await this.loadCloses(
      symbol,
      interval,
      lookback,
    );
    if (fallback) return null;
    const v = vwap(highs, lows, closes, volumes);
    if (v !== null) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getTrend(
    symbol: string,
    interval = '1m',
    fastPeriod = 20,
    slowPeriod = 50,
  ): Promise<TrendResult | null> {
    const key = `trend:${symbol}:${interval}:${fastPeriod}:${slowPeriod}`;
    const cached = this.cache.get<TrendResult>(key);
    if (cached) return cached;

    const { closes } = await this.loadCloses(symbol, interval, Math.max(200, slowPeriod * 3));
    const v = trend(closes, fastPeriod, slowPeriod);
    if (v) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getEMA(symbol: string, interval = '1m', period = 20): Promise<number | null> {
    const key = `ema:${symbol}:${interval}:${period}`;
    const cached = this.cache.get<number>(key);
    if (cached !== null) return cached;

    const { closes } = await this.loadCloses(symbol, interval, Math.max(200, period * 3));
    const v = ema(closes, period);
    if (v !== null) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  async getSMA(symbol: string, interval = '1m', period = 20): Promise<number | null> {
    const key = `sma:${symbol}:${interval}:${period}`;
    const cached = this.cache.get<number>(key);
    if (cached !== null) return cached;

    const { closes } = await this.loadCloses(symbol, interval, Math.max(200, period * 3));
    const v = sma(closes, period);
    if (v !== null) this.cache.set(key, v, DEFAULT_TTL_MS);
    return v;
  }

  /**
   * Snapshot completo. Usado por Fase 5 (Claude analyst) y dashboards.
   */
  async getSnapshot(symbol: string, interval = '1m'): Promise<IndicatorSnapshot> {
    const key = `snapshot:${symbol}:${interval}`;
    const cached = this.cache.get<IndicatorSnapshot>(key);
    if (cached) return cached;

    const { closes, highs, lows, volumes, fallback } = await this.loadCloses(
      symbol,
      interval,
      300,
    );

    const snapshot: IndicatorSnapshot = {
      symbol,
      interval,
      lastClose: closes[closes.length - 1] ?? 0,
      rsi: rsi(closes, 14),
      bollinger: bollinger(closes, 20, 2),
      macd: macd(closes, 12, 26, 9),
      atr: fallback ? null : atr(highs, lows, closes, 14),
      vwap: fallback ? null : vwap(highs, lows, closes, volumes),
      trend: trend(closes, 20, 50),
      emaFast: ema(closes, 20),
      emaSlow: ema(closes, 50),
      timestamp: new Date(),
    };

    this.cache.set(key, snapshot, DEFAULT_TTL_MS);
    return snapshot;
  }

  /** Backwards compat con estrategias que ya llaman este método. */
  async calculateRSIWithInterval(
    symbol: string,
    period = 14,
    intervalMinutes = 1,
  ): Promise<number | null> {
    const interval = `${intervalMinutes}m`;
    return this.getRSI(symbol, interval, period);
  }
}
