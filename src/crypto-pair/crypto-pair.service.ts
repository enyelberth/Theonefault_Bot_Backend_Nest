import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCryptoPairDto } from './dto/create-crypto-pair.dto';
import { UpdateCryptoPairDto } from './dto/update-crypto-pair.dto';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class CryptoPairService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(createCryptoPairDto: CreateCryptoPairDto) {
    const base = createCryptoPairDto.baseCurrencyCode.trim().toUpperCase();
    const quote = createCryptoPairDto.quoteCurrencyCode.trim().toUpperCase();
    if (base === quote)
      throw new BadRequestException('La base y la quote deben ser distintas');
    try {
      return await this.prisma.tradingPair.create({
        data: { baseCurrencyCode: base, quoteCurrencyCode: quote },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('El par ya existe');
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.tradingPair.findMany({ orderBy: { id: 'asc' } });
  }

  async findOne(id: number) {
    const pair = await this.prisma.tradingPair.findUnique({ where: { id } });
    if (!pair) throw new NotFoundException(`Par con id ${id} no encontrado`);
    return pair;
  }

  async update(id: number, updateCryptoPairDto: UpdateCryptoPairDto) {
    await this.findOne(id);
    return this.prisma.tradingPair.update({
      where: { id },
      data: {
        ...(updateCryptoPairDto.baseCurrencyCode
          ? {
              baseCurrencyCode: updateCryptoPairDto.baseCurrencyCode
                .trim()
                .toUpperCase(),
            }
          : {}),
        ...(updateCryptoPairDto.quoteCurrencyCode
          ? {
              quoteCurrencyCode: updateCryptoPairDto.quoteCurrencyCode
                .trim()
                .toUpperCase(),
            }
          : {}),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.tradingPair.delete({ where: { id } });
  }
}
