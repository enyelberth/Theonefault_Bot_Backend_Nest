import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateTransferDto } from './dto/create-tranfer.dto';
import { TransactionStatusDto } from './dto/create-transactionStatus';
import { UpdateTransferDto } from './dto/update-tranfer.dto';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly prisma: PrismaClient) {}

  private buildTransferDescription(
    description: string | undefined,
    metadata: {
      idempotencyKey?: string;
      externalReference?: string;
      receiptUrl?: string;
    },
  ) {
    return JSON.stringify({
      description: description ?? null,
      metadata,
    });
  }

  private parseTransferDescription(description?: string | null) {
    if (!description) {
      return { description: null, metadata: {} };
    }

    try {
      const parsed = JSON.parse(description);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      return { description, metadata: {} };
    }

    return { description, metadata: {} };
  }

  private async ensureTransactionStatus(statusName: string) {
    const normalized = statusName.trim().toUpperCase();
    const existing = await this.prisma.transactionStatus.findFirst({
      where: { statusName: normalized },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.transactionStatus.create({
      data: { statusName: normalized },
    });
  }

  async createTranfer(createTransactionDto: CreateTransferDto) {
    try {
      const transaction = await this.prisma.transfer.create({
        data: createTransactionDto,
      });
      return transaction;
    } catch (error) {
      this.logger.error('Error creando transacción', error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint failed
          throw new BadRequestException(
            'Ya existe una transacción con ese identificador único.',
          );
        }
      }

      throw new InternalServerErrorException(
        'Error inesperado al crear la transacción.',
      );
    }
  }

  async createManagedTransfer(
    createTransferDto: CreateTransferDto & {
      idempotencyKey?: string;
      externalReference?: string;
      receiptUrl?: string;
    },
  ) {
    if (createTransferDto.idempotencyKey) {
      const transfers = await this.prisma.transfer.findMany({
        where: {
          description: {
            contains: createTransferDto.idempotencyKey,
          },
        },
        take: 1,
      });

      if (transfers.length > 0) {
        return {
          idempotent: true,
          transfer: transfers[0],
        };
      }
    }

    const pendingStatus = await this.ensureTransactionStatus('PENDING');

    const transfer = await this.prisma.transfer.create({
      data: {
        ...createTransferDto,
        statusId: createTransferDto.statusId ?? pendingStatus.id,
        description: this.buildTransferDescription(
          createTransferDto.description,
          {
            idempotencyKey: createTransferDto.idempotencyKey,
            externalReference: createTransferDto.externalReference,
            receiptUrl: createTransferDto.receiptUrl,
          },
        ),
      },
    });

    return {
      idempotent: false,
      transfer,
    };
  }
  async createTransactionStatus(transactionStatusDto: TransactionStatusDto) {
    try {
      const transaction = await this.prisma.transactionStatus.create({
        data: transactionStatusDto,
      });
      return transaction;
    } catch (error) {
      this.logger.error('Error creando transacción', error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          // Unique constraint failed
          throw new BadRequestException(
            'Ya existe una transacción con ese identificador único.',
          );
        }
      }

      throw new InternalServerErrorException(
        'Error inesperado al crear la transacción.',
      );
    }
  }
  async findAllTransactionStatus() {
    try {
      return await this.prisma.transactionStatus.findMany();
    } catch (error) {
      this.logger.error('Error obteniendo transferencias', error);
      throw new InternalServerErrorException(
        'Error inesperado al obtener las transferencias.',
      );
    }
  }

  async findAllTranfer() {
    try {
      return await this.prisma.transfer.findMany();
    } catch (error) {
      this.logger.error('Error obteniendo transferencias', error);
      throw new InternalServerErrorException(
        'Error inesperado al obtener las transferencias.',
      );
    }
  }

  async findOneTranfer(id: number) {
    try {
      const transaction = await this.prisma.transfer.findUnique({
        where: { id },
      });
      if (!transaction) {
        throw new NotFoundException(`Transacción con id ${id} no encontrada.`);
      }
      return transaction;
    } catch (error) {
      this.logger.error(`Error buscando transacción con id ${id}`, error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        'Error inesperado al buscar la transacción.',
      );
    }
  }

  async update(id: number, updateTransactionDto: UpdateTransferDto) {
    try {
      const transaction = await this.prisma.transfer.update({
        where: { id },
        data: updateTransactionDto,
      });
      return transaction;
    } catch (error) {
      this.logger.error(`Error actualizando transacción con id ${id}`, error);

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          // Record not found
          throw new NotFoundException(
            `Transacción con id ${id} no encontrada para actualizar.`,
          );
        }
        if (error.code === 'P2002') {
          throw new BadRequestException(
            'Los datos actualizados violan una restricción única.',
          );
        }
      }

      throw new InternalServerErrorException(
        'Error inesperado al actualizar la transacción.',
      );
    }
  }

  async transitionTransferStatus(
    id: number,
    statusName: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED',
  ) {
    const status = await this.ensureTransactionStatus(statusName);
    return this.prisma.transfer.update({
      where: { id },
      data: { statusId: status.id },
      include: { status: true },
    });
  }

  async reconcileTransfer(id: number) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        journalEntry: {
          include: { lines: true },
        },
        status: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Transacción con id ${id} no encontrada.`);
    }

    const lines = transfer.journalEntry?.lines ?? [];
    const matchingCurrency = lines.filter(
      (line) => line.currencyCode === transfer.currencyCode,
    );
    const totalAmount = matchingCurrency.reduce(
      (acc, line) => acc.plus(line.amount),
      new Prisma.Decimal(0),
    );

    return {
      transferId: transfer.id,
      status: transfer.status.statusName,
      currencyCode: transfer.currencyCode,
      transferAmount: transfer.amount.toString(),
      journalEntryId: transfer.journalEntryId,
      matchingLines: matchingCurrency.length,
      journalAmountRaw: totalAmount.toString(),
      matchesExpectedAmount: totalAmount.gte(
        new Prisma.Decimal(transfer.amount),
      ),
      metadata: this.parseTransferDescription(transfer.description),
    };
  }

  async getTransferDiagnostics() {
    const [transfers, grouped] = await Promise.all([
      this.prisma.transfer.findMany({
        include: { status: true },
        orderBy: { transferDate: 'desc' },
        take: 50,
      }),
      this.prisma.transfer.groupBy({
        by: ['statusId', 'currencyCode'],
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      latest: transfers.map((item) => ({
        id: item.id,
        currencyCode: item.currencyCode,
        amount: item.amount.toString(),
        statusId: item.statusId,
        transferDate: item.transferDate,
        metadata: this.parseTransferDescription(item.description),
      })),
      grouped,
    };
  }

  async remove(id: number) {
    /*
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
  */
  }
}
