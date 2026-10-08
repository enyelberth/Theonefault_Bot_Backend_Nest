import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(code: string) {
    const currency = await this.prisma.currency.findUnique({
      where: { code: this.normalize(code) },
    });
    if (!currency) throw new NotFoundException(`Moneda ${code} no encontrada`);
    return currency;
  }

  async create(dto: CreateCurrencyDto) {
    try {
      return await this.prisma.currency.create({
        data: {
          code: this.normalize(dto.code),
          description: dto.description?.trim() || null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(`La moneda ${dto.code} ya existe`);
      }
      throw error;
    }
  }

  async update(code: string, dto: UpdateCurrencyDto) {
    await this.findOne(code);
    try {
      return await this.prisma.currency.update({
        where: { code: this.normalize(code) },
        data: {
          ...(dto.code !== undefined ? { code: this.normalize(dto.code) } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(`La moneda ${dto.code} ya existe`);
      }
      throw error;
    }
  }

  async remove(code: string) {
    await this.findOne(code);
    try {
      return await this.prisma.currency.delete({
        where: { code: this.normalize(code) },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'No se puede eliminar una moneda con registros asociados',
        );
      }
      throw error;
    }
  }

  private normalize(code: string) {
    return String(code || '')
      .trim()
      .toUpperCase();
  }
}
