import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
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

  async findOneWithBalance(id: number) {
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
      return account;
    } catch (error) {
      this.logger.error(
        `Error buscando cuenta con id ${id} incluyendo saldo`,
        error,
      );
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar la cuenta con saldo.',
      );
    }
  }

  async findByUserIdWithBalances(userId: number) {
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

  async update(id: number, updateAccountDto: UpdateAccountDto) {
    try {
      const account = await this.prisma.account.update({
        where: { id },
        data: updateAccountDto,
      });
      return account;
    } catch (error) {
      this.logger.error(`Error actualizando cuenta con id ${id}`, error);

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

  async remove(id: number) {
    try {
      const account = await this.prisma.account.delete({
        where: { id },
      });
      return account;
    } catch (error) {
      this.logger.error(`Error eliminando cuenta con id ${id}`, error);

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

  async findByEmail(email: string) {
    try {
      const account = await this.prisma.account.findUnique({
        where: { email },
      });
      if (!account) {
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

  async findAccountByEmail(email: string) {
    return this.findByEmail(email);
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
  ) {
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
