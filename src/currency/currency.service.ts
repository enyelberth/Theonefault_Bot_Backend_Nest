import { Injectable, NotFoundException } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCurrencyDto: CreateCurrencyDto): Promise<Currency> {
    return this.prisma.currency.create({ data: createCurrencyDto });
  }

  async findAll(): Promise<Currency[]> {
    return this.prisma.currency.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(code: string): Promise<Currency> {
    const currency = await this.prisma.currency.findUnique({ where: { code } });
    if (!currency) {
      throw new NotFoundException(`Currency with code ${code} not found`);
    }

    return currency;
  }

  async update(
    code: string,
    updateCurrencyDto: UpdateCurrencyDto,
  ): Promise<Currency> {
    await this.findOne(code);
    return this.prisma.currency.update({
      where: { code },
      data: updateCurrencyDto,
    });
  }

  async remove(code: string): Promise<Currency> {
    await this.findOne(code);
    return this.prisma.currency.delete({ where: { code } });
  }
}
