import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async create(createAccountDto: CreateAccountDto) {
    try {
      const account = await this.prisma.account.create({
        data: createAccountDto,
      });
      return account;
    } catch (error) {
      this.logger.error('Error creando cuenta', error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Ya existe una cuenta con esa clave o información única.',
          );
        }
      }
      throw new InternalServerErrorException(
        'Error inesperado al crear la cuenta.',
      );
    }
  }

  async findOneWithBalance(id: number, requestUserId: number) {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id },
        include: {
          accountBalances: {
            include: {
              currency: true,
            },
          },
          bankAccountType: true,
        },
      });

      if (!account) {
        throw new NotFoundException(`Cuenta con id ${id} no encontrada`);
      }
      if (account.userId !== requestUserId) {
        throw new ForbiddenException('No tienes acceso a esta cuenta');
      }
      return account;
    } catch (error) {
      this.logger.error(
        `Error buscando cuenta con id ${id} incluyendo saldo`,
        error,
      );
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar la cuenta con saldo.',
      );
    }
  }

  async findAllAccountBalance(id: number, requestUserId: number) {
    await this.assertOwnedAccount(id, requestUserId);
    return this.prisma.accountBalance.findMany({
      where: { accountId: id },
      include: { currency: true },
      orderBy: { currencyCode: 'asc' },
    });
  }

  /** Lanza NotFoundException/ForbiddenException si la cuenta no existe o no pertenece a requestUserId. */
  private async assertOwnedAccount(accountId: number, requestUserId: number) {
    const account = await this.findOne(accountId);
    if (account.userId !== requestUserId) {
      throw new ForbiddenException('No tienes acceso a esta cuenta');
    }
    return account;
  }

  findAllBalances() {
    return this.prisma.accountBalance.findMany({
      include: {
        currency: true,
        account: { include: { bankAccountType: true } },
      },
      orderBy: { id: 'asc' },
    });
  }

  async createBalance(
    accountId: number,
    currencyCode: string,
    newBalance: number,
    requestUserId: number,
  ) {
    await this.assertOwnedAccount(accountId, requestUserId);
    try {
      return await this.prisma.accountBalance.create({
        data: {
          accountId,
          currencyCode: currencyCode.trim().toUpperCase(),
          balance: newBalance,
        },
        include: { currency: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Ya existe un saldo para esa cuenta y moneda',
        );
      }
      throw error;
    }
  }

  async updateBalanceById(
    id: number,
    newBalance: number,
    requestUserId: number,
  ) {
    const existing = await this.prisma.accountBalance.findUnique({
      where: { id },
      include: { account: true },
    });
    if (!existing) {
      throw new NotFoundException(`Saldo con id ${id} no encontrado`);
    }
    if (existing.account.userId !== requestUserId) {
      throw new ForbiddenException('No tienes acceso a este saldo');
    }
    try {
      return await this.prisma.accountBalance.update({
        where: { id },
        data: { balance: newBalance },
        include: { currency: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Saldo con id ${id} no encontrado`);
      }
      throw error;
    }
  }

  async findByUserIdWithBalances(userId: number, requestUserId: number) {
    if (userId !== requestUserId) {
      throw new ForbiddenException(
        'No tienes acceso a las cuentas de este usuario',
      );
    }
    try {
      const accounts = await this.prisma.account.findMany({
        where: { userId },
        include: {
          accountBalances: {
            include: {
              currency: true,
            },
          },
          bankAccountType: true,
        },
      });

      if (!accounts || accounts.length === 0) {
        throw new NotFoundException(
          `No se encontraron cuentas para el usuario con id ${userId}`,
        );
      }
      return accounts;
    } catch (error) {
      this.logger.error(
        `Error buscando cuentas del usuario con id ${userId} incluyendo saldos`,
        error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar cuentas por usuario con sus saldos.',
      );
    }
  }
  async findCryptosByUserId(userId: number) {
    try {
      const accounts = await this.prisma.account.findMany({
        where: { userId },
        include: {
          accountBalances: {
            include: {
              currency: true,
            },
          },
        },
      });

      if (!accounts || accounts.length === 0) {
        throw new NotFoundException(
          `No se encontraron cuentas para el usuario con id ${userId}`,
        );
      }

      // Extraemos solo las cryptos de los saldos con su información de moneda
      const cryptos = accounts.flatMap((account) =>
        account.accountBalances.map((balance) => ({
          symbol: balance.currency.code,
          balance: balance.balance,
        })),
      );

      return cryptos;
    } catch (error) {
      this.logger.error(
        `Error buscando cryptos del usuario con id ${userId}`,
        error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar cryptos de usuario.',
      );
    }
  }

  async findAll() {
    try {
      return await this.prisma.account.findMany();
    } catch (error) {
      this.logger.error('Error buscando cuentas', error);
      throw new InternalServerErrorException(
        'Error inesperado al buscar cuentas.',
      );
    }
  }

  async findByUserId(userId: number) {
    try {
      const accounts = await this.prisma.account.findMany({
        where: { userId },
      });
      if (!accounts || accounts.length === 0) {
        throw new NotFoundException(
          `No se encontraron cuentas para el usuario con id ${userId}`,
        );
      }
      return accounts;
    } catch (error) {
      this.logger.error(
        `Error buscando cuentas del usuario con id ${userId}`,
        error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar cuentas por usuario.',
      );
    }
  }

  async findOne(id: number) {
    try {
      const account = await this.prisma.account.findUnique({
        where: { id },
      });
      if (!account) {
        throw new NotFoundException(`Cuenta con id ${id} no encontrada`);
      }
      return account;
    } catch (error) {
      this.logger.error(`Error buscando cuenta con id ${id}`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar la cuenta.',
      );
    }
  }

  async update(
    id: number,
    updateAccountDto: UpdateAccountDto,
    requestUserId: number,
  ) {
    await this.assertOwnedAccount(id, requestUserId);
    // El dueño de la cuenta no puede reasignarla a otro userId vía este endpoint.
    const { userId: _ignoredUserId, ...safeDto } = updateAccountDto;
    try {
      const account = await this.prisma.account.update({
        where: { id },
        data: safeDto,
      });
      return account;
    } catch (error) {
      this.logger.error(`Error actualizando cuenta con id ${id}`, error);

      if (error instanceof ForbiddenException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Cuenta con id ${id} no encontrada para actualizar`,
          );
        }
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Los datos actualizados violan una restricción única.',
          );
        }
      }
      throw new InternalServerErrorException(
        'Error inesperado al actualizar la cuenta.',
      );
    }
  }

  async remove(id: number, requestUserId: number) {
    await this.assertOwnedAccount(id, requestUserId);
    try {
      const account = await this.prisma.account.delete({
        where: { id },
      });
      return account;
    } catch (error) {
      this.logger.error(`Error eliminando cuenta con id ${id}`, error);

      if (error instanceof ForbiddenException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          `Cuenta con id ${id} no encontrada para eliminar`,
        );
      }

      throw new InternalServerErrorException(
        'Error inesperado al eliminar la cuenta.',
      );
    }
  }

  async findByEmail(email: string, requestUserId: number) {
    try {
      const account = await this.prisma.account.findUnique({
        where: { email },
      });
      if (!account) {
        throw new NotFoundException(`Cuenta con email ${email} no encontrada`);
      }
      if (account.userId !== requestUserId) {
        // No revelamos existencia de cuentas ajenas por email (evita enumeración).
        throw new NotFoundException(`Cuenta con email ${email} no encontrada`);
      }
      return account;
    } catch (error) {
      this.logger.error(`Error buscando cuenta con email ${email}`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar la cuenta por email.',
      );
    }
  }

  async findAccountByEmail(email: string, requestUserId: number) {
    return this.findByEmail(email, requestUserId);
  }

  /**
   * Actualiza solo el saldo de una criptomoneda en una cuenta,
   * usando la clave compuesta accountId y currencyCode.
   * Lanza NotFoundException si no existe el registro.
   */
  async updateCryptoBalance(
    accountId: number,
    currencyCode: string,
    newBalance: number,
    requestUserId: number,
  ) {
    await this.assertOwnedAccount(accountId, requestUserId);
    try {
      const updatedAccountBalance = await this.prisma.accountBalance.update({
        where: {
          accountId_currencyCode: {
            accountId,
            currencyCode,
          },
        },
        data: {
          balance: newBalance,
        },
      });
      return updatedAccountBalance;
    } catch (error) {
      this.logger.error(
        `Error actualizando saldo para cuenta ${accountId} y moneda ${currencyCode}`,
        error,
      );

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(
          `Saldo para cuenta ${accountId} con moneda ${currencyCode} no encontrado para actualizar`,
        );
      }

      throw new InternalServerErrorException(
        'Error inesperado al actualizar el saldo.',
      );
    }
  }
}
