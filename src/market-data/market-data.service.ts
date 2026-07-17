import { Injectable, Logger } from '@nestjs/common';
import { Candle, CryptoPrice, PrismaClient } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';

export interface UpsertCandleInput {
  symbol: string;
  interval: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades?: number;
}

export interface CandleRangeQuery {
  symbol: string;
  interval: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly binance: BinanceService,
  ) {}

  /**
   * Descarga velas históricas desde Binance y las guarda (upsert). Paginado.
   * Retorna resumen con conteo.
   */
  async backfill(input: {
    symbol: string;
    interval: string;
    days: number;
  }): Promise<{ symbol: string; interval: string; requested: number; inserted: number; batches: number }> {
    const symbol = input.symbol.toUpperCase();
    const interval = input.interval;
    const nowMs = Date.now();
    const startMs = nowMs - input.days * 24 * 3600 * 1000;
    const batchLimit = 1000;

    let cursor = startMs;
    let inserted = 0;
    let batches = 0;

    while (cursor < nowMs) {
      const batch = await this.binance.getCandles(symbol, interval, batchLimit, cursor, nowMs);
      batches += 1;
      if (!batch.length) break;
      for (const c of batch) {
        try {
          await this.upsertCandle({
            symbol,
            interval,
            openTime: new Date(Number(c.openTime)),
            closeTime: new Date(Number(c.closeTime)),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume),
          });
          inserted += 1;
        } catch (e) {
          this.logger.warn(`upsertCandle failed ${symbol} ${interval} ${c.openTime}: ${(e as Error).message}`);
        }
      }
      const lastCloseTime = Number(batch[batch.length - 1].closeTime);
      if (lastCloseTime <= cursor) break;
      cursor = lastCloseTime + 1;
      if (batch.length < batchLimit) break;
    }

    this.logger.log(`Backfill ${symbol} ${interval}: ${inserted} candles / ${batches} batches`);
    return {
      symbol,
      interval,
      requested: input.days,
      inserted,
      batches,
    };
  }

  async upsertCandle(input: UpsertCandleInput): Promise<Candle> {
    return this.prisma.candle.upsert({
      where: {
        symbol_interval_openTime: {
          symbol: input.symbol,
          interval: input.interval,
          openTime: input.openTime,
        },
      },
      create: input,
      update: {
        closeTime: input.closeTime,
        open: input.open,
        high: input.high,
        low: input.low,
        close: input.close,
        volume: input.volume,
        trades: input.trades,
      },
    });
  }

  async recordPriceTick(input: {
    symbol: string;
    price: number;
    volume?: number;
    timestamp: Date;
  }): Promise<CryptoPrice> {
    return this.prisma.cryptoPrice.create({ data: input });
  }

  async getCandles(query: CandleRangeQuery): Promise<Candle[]> {
    const where: any = {
      symbol: query.symbol,
      interval: query.interval,
    };
    if (query.from || query.to) {
      where.closeTime = {};
      if (query.from) where.closeTime.gte = query.from;
      if (query.to) where.closeTime.lte = query.to;
    }
    return this.prisma.candle.findMany({
      where,
      orderBy: { closeTime: 'desc' },
      take: query.limit ?? 500,
    });
  }

  async getLatestCandle(symbol: string, interval: string): Promise<Candle | null> {
    return this.prisma.candle.findFirst({
      where: { symbol, interval },
      orderBy: { closeTime: 'desc' },
    });
  }

  async getRecentPrices(symbol: string, limit = 500): Promise<CryptoPrice[]> {
    return this.prisma.cryptoPrice.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Retention: borra CryptoPrice antiguos y Candle segun intervalos.
   */
  async pruneOldData(config: {
    priceRetentionDays?: number;
    candleRetentionDays?: Record<string, number>;
  }): Promise<{ prices: number; candles: number }> {
    const now = new Date();
    let priceCount = 0;
    let candleCount = 0;

    if (config.priceRetentionDays) {
      const cutoff = new Date(now.getTime() - config.priceRetentionDays * 24 * 3600 * 1000);
      const res = await this.prisma.cryptoPrice.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });
      priceCount = res.count;
    }

    if (config.candleRetentionDays) {
      for (const [interval, days] of Object.entries(config.candleRetentionDays)) {
        const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
        const res = await this.prisma.candle.deleteMany({
          where: { interval, closeTime: { lt: cutoff } },
        });
        candleCount += res.count;
      }
    }

    if (priceCount || candleCount) {
      this.logger.log(`Prune: ${priceCount} prices, ${candleCount} candles`);
    }
    return { prices: priceCount, candles: candleCount };
  }

  async listSymbolsWithData(): Promise<string[]> {
    const rows = await this.prisma.candle.groupBy({
      by: ['symbol'],
    });
    return rows.map((r) => r.symbol);
  }

  /**
   * Estadísticas de mercado por símbolo + matriz de correlación entre símbolos
   * calculada sobre retornos de las últimas N velas del intervalo dado.
   */
  async analytics(input: {
    symbols: string[];
    interval: string;
    limit: number;
  }): Promise<{
    interval: string;
    limit: number;
    symbols: Array<{
      symbol: string;
      lastPrice: number;
      firstPrice: number;
      changePct: number;
      high: number;
      low: number;
      volume: number;
      volatilityPct: number;
      dataPoints: number;
    }>;
    correlation: Array<{ a: string; b: string; corr: number }>;
  }> {
    const perSymbolReturns = new Map<string, number[]>();
    const stats: any[] = [];

    for (const sym of input.symbols) {
      const rows = await this.prisma.candle.findMany({
        where: { symbol: sym, interval: input.interval },
        orderBy: { closeTime: 'desc' },
        take: input.limit,
      });
      if (!rows.length) {
        stats.push({
          symbol: sym,
          lastPrice: NaN,
          firstPrice: NaN,
          changePct: 0,
          high: 0,
          low: 0,
          volume: 0,
          volatilityPct: 0,
          dataPoints: 0,
        });
        perSymbolReturns.set(sym, []);
        continue;
      }
      const asc = rows.slice().reverse();
      const closes = asc.map((c) => Number(c.close));
      const highs = asc.map((c) => Number(c.high));
      const lows = asc.map((c) => Number(c.low));
      const vols = asc.map((c) => Number(c.volume));
      const firstPrice = closes[0];
      const lastPrice = closes[closes.length - 1];
      const changePct = firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
      const high = Math.max(...highs);
      const low = Math.min(...lows);
      const volume = vols.reduce((a, b) => a + b, 0);

      const rets: number[] = [];
      for (let i = 1; i < closes.length; i++) {
        const prev = closes[i - 1];
        if (prev > 0) rets.push((closes[i] - prev) / prev);
      }
      const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
      const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1);
      const volatilityPct = Math.sqrt(variance) * 100;

      stats.push({
        symbol: sym,
        lastPrice,
        firstPrice,
        changePct,
        high,
        low,
        volume,
        volatilityPct,
        dataPoints: closes.length,
      });
      perSymbolReturns.set(sym, rets);
    }

    // Correlación de Pearson entre pares
    const correlation: Array<{ a: string; b: string; corr: number }> = [];
    const symList = input.symbols;
    for (let i = 0; i < symList.length; i++) {
      for (let j = i + 1; j < symList.length; j++) {
        const a = symList[i];
        const b = symList[j];
        const ra = perSymbolReturns.get(a) ?? [];
        const rb = perSymbolReturns.get(b) ?? [];
        const n = Math.min(ra.length, rb.length);
        if (n < 2) {
          correlation.push({ a, b, corr: 0 });
          continue;
        }
        const sa = ra.slice(-n);
        const sb = rb.slice(-n);
        const ma = sa.reduce((x, y) => x + y, 0) / n;
        const mb = sb.reduce((x, y) => x + y, 0) / n;
        let num = 0;
        let da = 0;
        let db = 0;
        for (let k = 0; k < n; k++) {
          const xa = sa[k] - ma;
          const xb = sb[k] - mb;
          num += xa * xb;
          da += xa * xa;
          db += xb * xb;
        }
        const denom = Math.sqrt(da * db);
        const corr = denom > 0 ? num / denom : 0;
        correlation.push({ a, b, corr });
      }
    }

    return {
      interval: input.interval,
      limit: input.limit,
      symbols: stats,
      correlation,
    };
  }
}
