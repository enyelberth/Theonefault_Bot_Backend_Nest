import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  BadRequestException as NestBadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
} from './dto/create-journalEntry.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class JournalEntryService {
  private readonly logger = new Logger(JournalEntryService.name);

  constructor(private readonly prisma: PrismaClient) {}

  private async validateDto(dto: any) {
    const object = plainToInstance(dto.constructor, dto);
    const errors = await validate(object, { forbidUnknownValues: false });
    if (errors.length > 0) {
      const messages = errors
        .map((err) => (err.constraints ? Object.values(err.constraints) : []))
        .flat();
      throw new NestBadRequestException(messages);
    }
  }

  private handlePrismaError(error: any, contextMessage = 'Error inesperado') {
    this.logger.error(contextMessage, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          throw new BadRequestException(
            'Violación de restricción única: registro duplicado.',
          );
        case 'P2025':
          throw new NotFoundException(
            'Registro no encontrado para la operación solicitada.',
          );
        default:
          throw new InternalServerErrorException(
            `${contextMessage}. Código Prisma: ${error.code}`,
          );
      }
    } else {
      throw new InternalServerErrorException(contextMessage);
    }
  }

  private mapCreateLineDtoToPrisma(createDto: any) {
    return {
      accountId: createDto.accountId,
      currencyCode: createDto.currencyCode,
      amount: createDto.amount,
      entryType: createDto.entryType,
      entryId: createDto.entryId,
    };
  }

  private assertBalanced(
    lines: { amount: string | number | Prisma.Decimal; entryType: string }[],
  ) {
    let ingresos = new Prisma.Decimal(0);
    let egresos = new Prisma.Decimal(0);
    for (const line of lines) {
      const amount = new Prisma.Decimal(line.amount as any);
      if (line.entryType === 'INGRESO') {
        ingresos = ingresos.plus(amount);
      } else {
        egresos = egresos.plus(amount);
      }
    }
    if (!ingresos.equals(egresos)) {
      throw new BadRequestException(
        `El asiento no cuadra: ingresos ${ingresos.toString()} vs egresos ${egresos.toString()}`,
      );
    }
  }

  private async updateBalances(tx: Prisma.TransactionClient, lines: any[]) {
    for (const line of lines) {
      const { accountId, currencyCode, amount, entryType } = line;
      const decimalAmount =
        amount instanceof Prisma.Decimal ? amount : new Prisma.Decimal(amount);
      const balanceChange =
        entryType === 'INGRESO' ? decimalAmount : decimalAmount.negated();

      const existingBalance = await tx.accountBalance.findUnique({
        where: {
          accountId_currencyCode: {
            accountId,
            currencyCode,
          },
        },
      });

      if (existingBalance) {
        await tx.accountBalance.update({
          where: {
            accountId_currencyCode: {
              accountId,
              currencyCode,
            },
          },
          data: {
            balance: existingBalance.balance.plus(balanceChange),
          },
        });
      } else {
        await tx.accountBalance.create({
          data: {
            accountId,
            currencyCode,
            balance: balanceChange,
          },
        });
      }
    }
  }

  async create(createJournalEntryDto: CreateJournalEntryDto) {
    await this.validateDto(createJournalEntryDto);

    if (createJournalEntryDto.lines.length === 0) {
      throw new BadRequestException(
        'Debe proporcionar al menos una línea para la entrada',
      );
    }

    // Partida doble: ingresos y egresos deben cuadrar antes de tocar la base de datos.
    this.assertBalanced(createJournalEntryDto.lines);

    try {
      let newEntryId: number | null = null;

      const primeraLinea = createJournalEntryDto.lines[0];

      // Ejecuta procedimiento almacenado para crear JournalEntry y primera JournalEntryLine
      const result = await this.prisma.$queryRaw<
        { insertar_journal_entry_con_lineas: number }[]
      >`
        SELECT insertar_journal_entry_con_lineas(
          ${createJournalEntryDto.entryDate}::timestamp,
          ${createJournalEntryDto.description}::text,
          ${createJournalEntryDto.createdBy}::text,
          ${createJournalEntryDto.statusId ?? 1}::integer,
          ${primeraLinea.accountId}::integer,
          ${primeraLinea.currencyCode}::varchar,
          ${primeraLinea.amount}::numeric,
          ${primeraLinea.entryType}::text
        );
      `;

      newEntryId = result[0]?.insertar_journal_entry_con_lineas;
      if (!newEntryId) {
        throw new Error('No se pudo crear la entrada del diario');
      }

      // Inserta el resto de líneas, si existen
      for (let i = 1; i < createJournalEntryDto.lines.length; i++) {
        const linea = createJournalEntryDto.lines[i];
        await this.prisma.$queryRaw`
          INSERT INTO "JournalEntryLine" ("entryId", "accountId", "currencyCode", "amount", "entryType")
          VALUES (${newEntryId}, ${linea.accountId}, ${linea.currencyCode}, ${linea.amount}, ${linea.entryType})
        `;
      }

      // carga la entrada completa con líneas
      const entryComplete = await this.prisma.journalEntry.findUnique({
        where: { id: newEntryId },
        include: { lines: true, status: true, transfer: true },
      });

      if (!entryComplete) {
        throw new Error('Entrada del diario creada no encontrada');
      }

      // Actualiza balances dentro de una transacción
      await this.prisma.$transaction((tx) =>
        this.updateBalances(tx, entryComplete.lines),
      );

      return entryComplete;
    } catch (error) {
      this.handlePrismaError(
        error,
        'Error creando una entrada del diario con procedimiento almacenado',
      );
    }
  }

  async findAllJournalEntries(skip = 0, take = 10) {
    try {
      return await this.prisma.journalEntry.findMany({
        skip,
        take,
        orderBy: { entryDate: 'desc' },
        include: { lines: true, status: true, transfer: true },
      });
    } catch (error) {
      this.handlePrismaError(error, 'Error obteniendo entradas del diario');
    }
  }

  async getAccountingSummary() {
    const [total, lines, latestEntries, balances, orders] = await Promise.all([
      this.prisma.journalEntry.count(),
      this.prisma.journalEntryLine.findMany({
        select: { currencyCode: true, entryType: true, amount: true },
      }),
      this.prisma.journalEntry.findMany({
        take: 10,
        orderBy: { entryDate: 'desc' },
        include: { lines: true, status: true, transfer: true },
      }),
      this.prisma.accountBalance.findMany({
        include: {
          currency: true,
          account: { include: { bankAccountType: true } },
        },
        orderBy: { id: 'asc' },
      }),
      this.prisma.tradingOrder.findMany({
        select: { status: true, profit_loss: true },
      }),
    ]);

    const byCurrency = new Map<
      string,
      { ingresos: Prisma.Decimal; egresos: Prisma.Decimal }
    >();
    for (const line of lines) {
      const current = byCurrency.get(line.currencyCode) ?? {
        ingresos: new Prisma.Decimal(0),
        egresos: new Prisma.Decimal(0),
      };
      if (line.entryType === 'INGRESO')
        current.ingresos = current.ingresos.plus(line.amount);
      else current.egresos = current.egresos.plus(line.amount);
      byCurrency.set(line.currencyCode, current);
    }

    const tradingByStatus = new Map<
      string,
      { count: number; profitLoss: Prisma.Decimal }
    >();
    let realizedClosedProfitLoss = new Prisma.Decimal(0);
    for (const order of orders) {
      const current = tradingByStatus.get(order.status) ?? {
        count: 0,
        profitLoss: new Prisma.Decimal(0),
      };
      current.count += 1;
      if (order.profit_loss !== null) {
        current.profitLoss = current.profitLoss.plus(order.profit_loss);
        realizedClosedProfitLoss = realizedClosedProfitLoss.plus(
          order.profit_loss,
        );
      }
      tradingByStatus.set(order.status, current);
    }

    return {
      journalEntries: {
        total,
        byCurrency: [...byCurrency.entries()].map(([currencyCode, value]) => ({
          currencyCode,
          ingresos: value.ingresos.toString(),
          egresos: value.egresos.toString(),
          neto: value.ingresos.minus(value.egresos).toString(),
        })),
        latestEntries,
      },
      balances: balances.map((item) => ({
        accountId: item.accountId,
        accountType: item.account.bankAccountType?.typeName ?? '',
        currencyCode: item.currencyCode,
        balance: item.balance.toString(),
      })),
      trading: {
        realizedClosedProfitLoss: realizedClosedProfitLoss.toString(),
        byStatus: [...tradingByStatus.entries()].map(([status, value]) => ({
          status,
          count: value.count,
          profitLoss: value.profitLoss.toString(),
        })),
        binanceCrossMargin: null,
      },
    };
  }

  async findOneJournalEntry(id: number) {
    if (!id) throw new BadRequestException('ID es requerido');
    try {
      const journalEntry = await this.prisma.journalEntry.findUnique({
        where: { id },
        include: { lines: true, status: true, transfer: true },
      });
      if (!journalEntry)
        throw new NotFoundException(
          `Entrada del diario con id ${id} no encontrada.`,
        );
      return journalEntry;
    } catch (error) {
      this.handlePrismaError(
        error,
        `Error buscando la entrada del diario con id ${id}`,
      );
    }
  }

  async update(id: number, updateJournalEntryDto: UpdateJournalEntryDto) {
    if (!id) throw new BadRequestException('ID es requerido');
    await this.validateDto(updateJournalEntryDto);
    const prismaData = this.mapUpdateEntryDtoToPrisma(updateJournalEntryDto);
    try {
      // `mapUpdateEntryDtoToPrisma` nunca muta `lines`, así que `updatedEntry.lines` son las
      // líneas ya existentes sin cambios: llamar a `updateBalances` aquí reaplicaría el mismo
      // delta de balance en cada edición de metadata (ej. solo cambiar `description`),
      // duplicando el efecto contable cada vez que se llama a update(). No se debe invocar.
      return await this.prisma.$transaction(async (tx) => {
        return await tx.journalEntry.update({
          where: { id },
          data: prismaData,
          include: { lines: true },
        });
      });
    } catch (error) {
      this.handlePrismaError(
        error,
        `Error actualizando entrada del diario con id ${id}`,
      );
    }
  }

  async remove(id: number) {
    if (!id) throw new BadRequestException('ID es requerido');
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.journalEntryLine.deleteMany({ where: { entryId: id } });
        const deletedEntry = await tx.journalEntry.delete({ where: { id } });
        return {
          message: `Entrada del diario con id ${id} eliminada.`,
          deletedEntry,
        };
      });
    } catch (error) {
      this.handlePrismaError(
        error,
        `Error eliminando entrada del diario con id ${id}`,
      );
    }
  }

  async createLine(createLineDto: any) {
    try {
      const prismaLine = this.mapCreateLineDtoToPrisma(createLineDto);
      return await this.prisma.journalEntryLine.create({
        data: prismaLine,
      });
    } catch (error) {
      this.handlePrismaError(error, 'Error creando línea del asiento contable');
    }
  }

  async findAllLines(entryId?: number) {
    try {
      const where = entryId ? { entryId } : {};
      return await this.prisma.journalEntryLine.findMany({ where });
    } catch (error) {
      this.handlePrismaError(
        error,
        'Error obteniendo líneas del asiento contable',
      );
    }
  }

  async findOneLine(id: number) {
    try {
      const line = await this.prisma.journalEntryLine.findUnique({
        where: { id },
      });
      if (!line)
        throw new NotFoundException(
          `Línea del asiento con id ${id} no encontrada.`,
        );
      return line;
    } catch (error) {
      this.handlePrismaError(error, `Error buscando línea con id ${id}`);
    }
  }

  async updateLine(id: number, updateLineDto: any) {
    try {
      const data = this.mapUpdateLineDtoToPrisma(updateLineDto);
      return await this.prisma.journalEntryLine.update({ where: { id }, data });
    } catch (error) {
      this.handlePrismaError(error, `Error actualizando línea con id ${id}`);
    }
  }

  async removeLine(id: number) {
    try {
      const deleted = await this.prisma.journalEntryLine.delete({
        where: { id },
      });
      return { message: `Línea con id ${id} eliminada.`, deleted };
    } catch (error) {
      this.handlePrismaError(error, `Error eliminando línea con id ${id}`);
    }
  }

  private mapCreateEntryDtoToPrisma(createDto: CreateJournalEntryDto) {
    return {
      entryDate: createDto.entryDate,
      description: createDto.description,
      createdBy: createDto.createdBy,
      status: createDto.statusId
        ? { connect: { id: createDto.statusId } }
        : undefined,
      lines: {
        create: createDto.lines.map((line) => ({
          accountId: line.accountId,
          currencyCode: line.currencyCode,
          amount: line.amount,
          entryType: line.entryType,
        })),
      },
    };
  }

  private mapUpdateEntryDtoToPrisma(updateDto: UpdateJournalEntryDto) {
    return {
      entryDate: updateDto.entryDate,
      description: updateDto.description,
      createdBy: updateDto.createdBy,
      status: updateDto.statusId
        ? { connect: { id: updateDto.statusId } }
        : undefined,
    };
  }

  private mapUpdateLineDtoToPrisma(updateDto: any) {
    return {
      accountId: updateDto.accountId,
      currencyCode: updateDto.currencyCode,
      amount: updateDto.amount,
      entryType: updateDto.entryType,
    };
  }
}
