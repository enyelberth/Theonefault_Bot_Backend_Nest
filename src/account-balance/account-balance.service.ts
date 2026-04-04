import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountBalance } from '@prisma/client';
import { CreateAccountBalanceDto } from './dto/create-account-balance.dto';
import { UpdateAccountBalanceDto } from './dto/update-account-balance.dto';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class AccountBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAccountBalanceDto: CreateAccountBalanceDto): Promise<AccountBalance> {
    return this.prisma.accountBalance.create({ data: createAccountBalanceDto });
  }

  async findAll(): Promise<AccountBalance[]> {
    return this.prisma.accountBalance.findMany({
      orderBy: [{ accountId: 'asc' }, { currencyCode: 'asc' }],
    });
  }

  async findOne(id: number): Promise<AccountBalance> {
    const accountBalance = await this.prisma.accountBalance.findUnique({ where: { id } });
    if (!accountBalance) {
      throw new NotFoundException(`AccountBalance with id ${id} not found`);
    }

    return accountBalance;
  }

  async findByAccount(accountId: number): Promise<AccountBalance[]> {
    return this.prisma.accountBalance.findMany({
      where: { accountId },
      orderBy: { currencyCode: 'asc' },
    });
  }

  async update(id: number, updateAccountBalanceDto: UpdateAccountBalanceDto): Promise<AccountBalance> {
    await this.findOne(id);
    return this.prisma.accountBalance.update({
      where: { id },
      data: updateAccountBalanceDto,
    });
  }

  async remove(id: number): Promise<AccountBalance> {
    await this.findOne(id);
    return this.prisma.accountBalance.delete({ where: { id } });
  }
}