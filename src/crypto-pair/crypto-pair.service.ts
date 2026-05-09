import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCryptoPairDto } from './dto/create-crypto-pair.dto';
import { UpdateCryptoPairDto } from './dto/update-crypto-pair.dto';
import { TradingPair } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class CryptoPairService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCryptoPairDto: CreateCryptoPairDto): Promise<TradingPair> {
    return this.prisma.tradingPair.create({
      data: {
        baseCurrencyCode: createCryptoPairDto.baseCurrencyCode.toUpperCase(),
        quoteCurrencyCode: createCryptoPairDto.quoteCurrencyCode.toUpperCase(),
      },
    });
  }

  async findAll(): Promise<TradingPair[]> {
    return this.prisma.tradingPair.findMany({
      orderBy: [{ baseCurrencyCode: 'asc' }, { quoteCurrencyCode: 'asc' }],
    });
  }

  async findOne(id: number): Promise<TradingPair> {
    const tradingPair = await this.prisma.tradingPair.findUnique({
      where: { id },
    });
    if (!tradingPair) {
      throw new NotFoundException(`Crypto pair with id ${id} not found`);
    }

    return tradingPair;
  }

  async update(
    id: number,
    updateCryptoPairDto: UpdateCryptoPairDto,
  ): Promise<TradingPair> {
    await this.findOne(id);
    return this.prisma.tradingPair.update({
      where: { id },
      data: {
        ...(updateCryptoPairDto.baseCurrencyCode
          ? {
              baseCurrencyCode:
                updateCryptoPairDto.baseCurrencyCode.toUpperCase(),
            }
          : {}),
        ...(updateCryptoPairDto.quoteCurrencyCode
          ? {
              quoteCurrencyCode:
                updateCryptoPairDto.quoteCurrencyCode.toUpperCase(),
            }
          : {}),
      },
    });
  }

  async remove(id: number): Promise<TradingPair> {
    await this.findOne(id);
    return this.prisma.tradingPair.delete({ where: { id } });
  }
}
