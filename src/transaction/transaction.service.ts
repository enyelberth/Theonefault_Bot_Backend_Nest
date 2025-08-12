import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly prisma: PrismaClient) {}

  async create(createTransactionDto: CreateTransactionDto) {
    try {
      const transaction = await this.prisma.transaction.create({
        data: createTransactionDto,
      });
      return transaction;
    } catch (error) {
      this.logger.error('Error creando transacción', error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') { // Unique constraint failed
          throw new BadRequestException('Ya existe una transacción con ese identificador único.');
        }
      }

      throw new InternalServerErrorException('Error inesperado al crear la transacción.');
    }
  }

  async findAll() {
    try {
      return await this.prisma.transaction.findMany();
    } catch (error) {
      this.logger.error('Error obteniendo transacciones', error);
      throw new InternalServerErrorException('Error inesperado al obtener las transacciones.');
    }
  }

  async findOne(id: number) {
    try {
      const transaction = await this.prisma.transaction.findUnique({
        where: { id },
      });
      if (!transaction) {
        throw new NotFoundException(`Transacción con id ${id} no encontrada.`);
      }
      return transaction;
    } catch (error) {
      this.logger.error(`Error buscando transacción con id ${id}`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error inesperado al buscar la transacción.');
    }
  }

  async update(id: number, updateTransactionDto: UpdateTransactionDto) {
    try {
      const transaction = await this.prisma.transaction.update({
        where: { id },
        data: updateTransactionDto,
      });
      return transaction;
    } catch (error) {
      this.logger.error(`Error actualizando transacción con id ${id}`, error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') { // Record not found
          throw new NotFoundException(`Transacción con id ${id} no encontrada para actualizar.`);
        }
        if (error.code === 'P2002') {
          throw new BadRequestException('Los datos actualizados violan una restricción única.');
        }
      }

      throw new InternalServerErrorException('Error inesperado al actualizar la transacción.');
    }
  }

  async remove(id: number) {
    try {
      const transaction = await this.prisma.transaction.delete({
        where: { id },
      });
      return transaction;
    } catch (error) {
      this.logger.error(`Error eliminando transacción con id ${id}`, error);

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Transacción con id ${id} no encontrada para eliminar.`);
      }

      throw new InternalServerErrorException('Error inesperado al eliminar la transacción.');
    }
  }
}
