import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
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
        // Manejo ejemplo para error de unique constraint por email o apiKey
        if (error.code === 'P2002') {
          throw new BadRequestException('Ya existe una cuenta con ese email o API key.');
        }
      }
      throw new InternalServerErrorException('Error inesperado al crear la cuenta.');
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
  async findByEmail(email: string) {
  try {
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: {
        balance: true,  // Solo trae este campo
      },
    });
    if (!account) {
      throw new NotFoundException(`Cuenta con email ${email} no encontrada`);
    }
    return account;
  } catch (error) {
    this.logger.error(`Error buscando cuenta con email ${email}`, error);
    if (error instanceof NotFoundException) throw error;
    throw new InternalServerErrorException('Error inesperado al buscar la cuenta.');
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
