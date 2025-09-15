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

  constructor(private readonly prisma: PrismaClient) { }

  async create(createAccountDto: CreateAccountDto) {
    try {
      const account = await this.prisma.account.create({
        data: createAccountDto,
      });
      return account;
    } catch (error) {
      this.logger.error('Error creando cuenta', error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Manejo para error de restricción única (ejemplo 'key' o 'secretKey')
        if (error.code === 'P2002') {
          throw new BadRequestException('Ya existe una cuenta con esa clave o información única.');
        }
      }
      throw new InternalServerErrorException('Error inesperado al crear la cuenta.');
    }
  }
  async findAllAccountBalance(id: number) {
    try {
      const accounts = await this.prisma.$queryRaw<
        Array<{ id: number; email: string; balance: number; currencyCode: string; typeName: string }>
      >`
select "Account".id,"Account".email,"AccountBalance".balance,"AccountBalance"."currencyCode","BankAccountType"."typeName"    from "Account" 
	inner join "AccountBalance" on "Account".id = "AccountBalance"."accountId"
	inner join "BankAccountType" on "Account".id = "BankAccountType"."id" where "Account".id = ${id} and balance > 0;
    `;

      if (accounts.length === 0) {
        throw new NotFoundException(`Cuenta con id ${id} no encontrada o sin saldo positivo`);
      }

      return accounts;
    
    } catch (error) {
      this.logger.error(`Error buscando saldo de cuenta con id ${id}`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error inesperado al buscar el saldo de la cuenta.');
    }
  }



  async findAll() {
    try {
      return await this.prisma.account.findMany();
    } catch (error) {
      this.logger.error('Error buscando cuentas', error);
      throw new InternalServerErrorException('Error inesperado al buscar cuentas.');
    }
  }

  // No existe campo email en Account, si quieres buscar por usuario:
  async findByUserId(userId: number) {
    try {
      const accounts = await this.prisma.account.findMany({
        where: { userId },
      });
      if (!accounts || accounts.length === 0) {
        throw new NotFoundException(`No se encontraron cuentas para el usuario con id ${userId}`);
      }
      return accounts;
    } catch (error) {
      this.logger.error(`Error buscando cuentas del usuario con id ${userId}`, error);
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
      throw new InternalServerErrorException('Error inesperado al buscar la cuenta.');
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
          throw new NotFoundException(`Cuenta con id ${id} no encontrada para actualizar`);
        }
        if (error.code === 'P2002') {
          throw new BadRequestException('Los datos actualizados violan una restricción única.');
        }
      }
      throw new InternalServerErrorException('Error inesperado al actualizar la cuenta.');
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

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Cuenta con id ${id} no encontrada para eliminar`);
      }

      throw new InternalServerErrorException('Error inesperado al eliminar la cuenta.');
    }
  }
}
