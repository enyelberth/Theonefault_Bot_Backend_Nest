import { Injectable } from '@nestjs/common';
import {  CryptoPrice, PrismaClient } from '@prisma/client';

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
    return this.prisma.cryptoPrice.create({
      data,
    });
  }

  // Opcional: obtener todos los precios de una moneda
  async findPricesBySymbol(symbol: string): Promise<CryptoPrice[]> {
    return this.prisma.cryptoPrice.findMany({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
  }

  // Opcional: obtener último precio de una moneda
  async findLatestPrice(symbol: string): Promise<CryptoPrice | null> {
    return this.prisma.cryptoPrice.findFirst({
      where: { symbol },
      orderBy: { timestamp: 'desc' },
    });
  }
}
