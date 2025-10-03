import { Injectable } from '@nestjs/common';
import { CryptoPrice, PrismaClient } from '@prisma/client';

@Injectable()
export class IndicatorsService {
  constructor(private readonly prisma: PrismaClient) {}

  // Crear nuevo valor de precio para criptomoneda
  async createCryptoPrice(data: {
    symbol: string;
    price: number;
    volume?: number;
    timestamp: Date;
  }): Promise<CryptoPrice> {
    return this.prisma.cryptoPrice.create({ data });
  }

  // Obtener todos los precios de una moneda
  async findPricesBySymbol(symbol: string): Promise<CryptoPrice[]> {
    return this.prisma.cryptoPrice.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
  }

  // Obtener último precio de una moneda
  async findLatestPrice(symbol: string): Promise<CryptoPrice | null> {
    return this.prisma.cryptoPrice.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
  }

  // Calcular RSI con intervalo configurable (1 min, 16 min, 60 min, etc.)
  async calculateRSIWithInterval(symbol: string, period = 14, intervalMinutes = 1): Promise<number | null> {
    try {
      // Traer precios ordenados ascendentemente (por timestamp)
      const prices = await this.prisma.cryptoPrice.findMany({
        where: { symbol },
        orderBy: { timestamp: 'asc' },
        select: { price: true, timestamp: true },
      });

      if (prices.length < period * intervalMinutes) return null;

      // Agrupar precios según intervalMinutes (ej. 60 para 1 hora)
      const aggregatedPrices: number[] = [];
      for (let i = 0; i < prices.length; i += intervalMinutes) {
        // Usamos el precio del último minuto del intervalo como representativo
        aggregatedPrices.push(prices[Math.min(i + intervalMinutes - 1, prices.length - 1)].price);
      }

      if (aggregatedPrices.length < period + 1) return null;

      // Calcular ganancias y pérdidas iniciales
      let gains = 0;
      let losses = 0;
      for (let i = 1; i <= period; i++) {
        const change = aggregatedPrices[i] - aggregatedPrices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }

      let avgGain = gains / period;
      let avgLoss = losses / period;

      // Suavizar ganancias y pérdidas
      for (let i = period + 1; i < aggregatedPrices.length; i++) {
        const change = aggregatedPrices[i] - aggregatedPrices[i - 1];
        if (change > 0) {
          avgGain = (avgGain * (period - 1) + change) / period;
          avgLoss = (avgLoss * (period - 1)) / period;
        } else {
          avgGain = (avgGain * (period - 1)) / period;
          avgLoss = (avgLoss * (period - 1) - change) / period;
        }
      }

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - 100 / (1 + rs);

      return rsi;
    } catch (error) {
      console.error('Error calculando RSI:', error);
      return null;
    }
  }
}
