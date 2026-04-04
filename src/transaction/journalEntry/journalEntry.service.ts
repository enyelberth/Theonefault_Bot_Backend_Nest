import { Injectable, Logger, NotFoundException, BadRequestException, InternalServerErrorException, BadRequestException as NestBadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { BinanceService } from 'src/binance/binance.service';
import {
  CreateJournalEntryDto,
  CreateJournalEntryLineDto,
  EntryType,
  SyncBinanceBalancesDto,
  UpdateJournalEntryDto,
  UpdateJournalEntryLineDto,
} from './dto/create-journalEntry.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class JournalEntryService {
  private readonly logger = new Logger(JournalEntryService.name);
  private readonly ingresoAliases = new Set(['INGRESO', 'DEBIT', 'DEBITO', 'DÉBITO']);
  private readonly egresoAliases = new Set(['EGRESO', 'CREDIT', 'CREDITO', 'CRÉDITO']);
  private readonly maxCurrencyCodeLength = 20;
  private readonly binanceSyncOffsetKey = 'binance_sync_offset';
  private readonly binanceSyncOffsetEmail = 'binance.sync.offset@local';

  constructor(
    private readonly prisma: PrismaService,
    private readonly binanceService: BinanceService,
  ) {}

  private async validateDto(dto: any) {
    const object = plainToInstance(dto.constructor, dto);
    const errors = await validate(object, { forbidUnknownValues: false });
    if (errors.length > 0) {
      const messages = errors
        .map(err => (err.constraints ? Object.values(err.constraints) : []))
        .flat();
      throw new NestBadRequestException(messages);
    }
  }

  private handlePrismaError(error: any, contextMessage = 'Error inesperado') {
    this.logger.error(contextMessage, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          throw new BadRequestException('Violación de restricción única: registro duplicado.');
        case 'P2025':
          throw new NotFoundException('Registro no encontrado para la operación solicitada.');
        default:
          throw new InternalServerErrorException(`${contextMessage}. Código Prisma: ${error.code}`);
      }
    } else {
      throw new InternalServerErrorException(contextMessage);
    }
  }

  private mapCreateLineDtoToPrisma(createDto: CreateJournalEntryLineDto & { entryId: number }) {
    return {
      accountId: createDto.accountId,
      currencyCode: createDto.currencyCode,
      amount: createDto.amount,
      entryType: createDto.entryType,
      entryId: createDto.entryId,
    };
  }

  private toDecimal(value: Prisma.Decimal | string | number) {
    return new Prisma.Decimal(value);
  }

  private decimalToString(value: Prisma.Decimal | string | number) {
    return this.toDecimal(value).toString();
  }

  private normalizeEntryType(entryType: string) {
    const normalized = entryType?.toUpperCase();
    if (this.ingresoAliases.has(normalized)) {
      return EntryType.INGRESO;
    }

    if (this.egresoAliases.has(normalized)) {
      return EntryType.EGRESO;
    }

    throw new BadRequestException(`Tipo de asiento inválido: ${entryType}`);
  }

  private async rebuildBalancesFallback(tx: Prisma.TransactionClient | PrismaService) {
    const groupedLines = await tx.journalEntryLine.groupBy({
      by: ['accountId', 'currencyCode'],
      _sum: { amount: true },
    });

    const lines = await tx.journalEntryLine.findMany({
      select: {
        accountId: true,
        currencyCode: true,
        amount: true,
        entryType: true,
      },
    });

    const balanceMap = new Map<string, Prisma.Decimal>();
    for (const line of lines) {
      const key = `${line.accountId}:${line.currencyCode}`;
      const signedAmount = this.normalizeEntryType(line.entryType) === EntryType.INGRESO
        ? this.toDecimal(line.amount)
        : this.toDecimal(line.amount).mul(-1);

      const current = balanceMap.get(key) ?? new Prisma.Decimal(0);
      balanceMap.set(key, current.plus(signedAmount));
    }

    const existingBalances = await tx.accountBalance.findMany({
      select: { id: true, accountId: true, currencyCode: true },
    });

    for (const row of groupedLines) {
      const key = `${row.accountId}:${row.currencyCode}`;
      await tx.accountBalance.upsert({
        where: {
          accountId_currencyCode: {
            accountId: row.accountId,
            currencyCode: row.currencyCode,
          },
        },
        update: {
          balance: balanceMap.get(key) ?? new Prisma.Decimal(0),
        },
        create: {
          accountId: row.accountId,
          currencyCode: row.currencyCode,
          balance: balanceMap.get(key) ?? new Prisma.Decimal(0),
        },
      });
    }

    for (const existing of existingBalances) {
      const key = `${existing.accountId}:${existing.currencyCode}`;
      if (!balanceMap.has(key)) {
        await tx.accountBalance.update({
          where: { id: existing.id },
          data: { balance: new Prisma.Decimal(0) },
        });
      }
    }
  }

  private async executeBalanceProcedure(executor: Prisma.TransactionClient | PrismaService, procedure = 'recalculate_all_account_balances') {
    try {
      await executor.$queryRawUnsafe(`SELECT ${procedure}()`);
    } catch (error) {
      this.logger.error(`Error ejecutando procedimiento ${procedure}`, error as Error);

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2010' &&
        typeof error.meta?.message === 'string' &&
        error.meta.message.includes(`function ${procedure}() does not exist`)
      ) {
        this.logger.warn(`El proceso ${procedure} no existe en la base actual. Se aplicará recálculo local.`);
        await this.rebuildBalancesFallback(executor);
        return;
      }

      throw new InternalServerErrorException(
        `No se pudo ejecutar el proceso almacenado ${procedure}. Verifica que la migración SQL esté aplicada.`,
      );
    }
  }

  private async ensureAccountsExist(tx: Prisma.TransactionClient, accountIds: number[]) {
    const uniqueIds = [...new Set(accountIds.filter(id => Number.isInteger(id) && id > 0))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Debe indicar al menos una cuenta válida para el asiento contable.');
    }

    const accounts = await tx.account.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });

    const existingIds = new Set(accounts.map(account => account.id));
    const missingIds = uniqueIds.filter(id => !existingIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException({
        message: 'Hay cuentas contables que no existen.',
        missingAccountIds: missingIds,
      });
    }
  }

  private async ensureCurrenciesExist(tx: Prisma.TransactionClient, currencyCodes: string[]) {
    const uniqueCodes = [...new Set(
      currencyCodes
        .map(code => code.trim().toUpperCase())
        .filter(Boolean),
    )];

    if (uniqueCodes.length === 0) {
      return;
    }

    const unsupportedCodes = uniqueCodes.filter(code => code.length > this.maxCurrencyCodeLength);
    if (unsupportedCodes.length > 0) {
      throw new BadRequestException({
        message: 'Hay códigos de moneda demasiado largos para el esquema actual.',
        unsupportedCodes,
        maxLength: this.maxCurrencyCodeLength,
      });
    }

    await tx.currency.createMany({
      data: uniqueCodes.map(code => ({
        code,
        description: `Auto-created from Binance sync for ${code}`,
      })),
      skipDuplicates: true,
    });
  }

  private validateBalancedLines(lines: Array<{ currencyCode: string; amount: Prisma.Decimal | string | number; entryType: string }>) {
    if (lines.length < 2) {
      throw new BadRequestException('Un journal entry balanceado debe tener al menos dos líneas.');
    }

    const totals = new Map<string, { ingreso: Prisma.Decimal; egreso: Prisma.Decimal }>();

    for (const line of lines) {
      const currencyCode = line.currencyCode.trim().toUpperCase();
      const amount = this.toDecimal(line.amount);
      const entryType = this.normalizeEntryType(line.entryType);

      if (amount.lte(0)) {
        throw new BadRequestException('Cada línea contable debe tener un monto mayor que cero.');
      }

      const current = totals.get(currencyCode) ?? {
        ingreso: new Prisma.Decimal(0),
        egreso: new Prisma.Decimal(0),
      };

      if (entryType === EntryType.INGRESO) {
        current.ingreso = current.ingreso.plus(amount);
      } else {
        current.egreso = current.egreso.plus(amount);
      }

      totals.set(currencyCode, current);
    }

    const unbalancedCurrencies = [...totals.entries()]
      .filter(([, total]) => !total.ingreso.equals(total.egreso))
      .map(([currencyCode, total]) => ({
        currencyCode,
        ingreso: total.ingreso.toString(),
        egreso: total.egreso.toString(),
      }));

    if (unbalancedCurrencies.length > 0) {
      throw new BadRequestException({
        message: 'El journal entry no está balanceado por moneda.',
        unbalancedCurrencies,
      });
    }
  }

  private async getEntryLinesOrFail(entryId: number, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    const lines = await tx.journalEntryLine.findMany({ where: { entryId } });
    if (lines.length === 0) {
      throw new BadRequestException('La entrada no tiene líneas contables.');
    }
    return lines;
  }

  async rebuildAllBalances() {
    await this.executeBalanceProcedure(this.prisma);
    return { message: 'Balances recalculados correctamente desde JournalEntryLine.' };
  }

  private async buildRemoteBalancesForAccountType(accountId: number) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: { bankAccountType: true, accountBalances: true },
    });

    if (!account) {
      throw new NotFoundException(`Cuenta con id ${accountId} no encontrada.`);
    }

    const typeName = account.bankAccountType?.typeName?.trim().toLowerCase() ?? '';
    const localBalances = new Map(
      account.accountBalances.map(balance => [
        balance.currencyCode.toUpperCase(),
        this.toDecimal(balance.balance),
      ]),
    );

    const remoteBalances = new Map<string, Prisma.Decimal>();
    let scope = 'SPOT';

    if (typeName.includes('spot')) {
      scope = 'SPOT';
      const balances = await this.binanceService.getSpotBalances();
      for (const asset of balances) {
        const amount = this.toDecimal(asset.free ?? 0).plus(asset.locked ?? 0);
        remoteBalances.set(String(asset.asset).toUpperCase(), amount);
      }
    } else if (typeName.includes('cross') || typeName.includes('cruzado')) {
      scope = 'MARGIN_CROSS';
      const balances = await this.binanceService.getCrossMarginBalances();
      for (const asset of balances) {
        const amount = asset.netAsset !== undefined
          ? this.toDecimal(asset.netAsset)
          : this.toDecimal(asset.free ?? 0)
              .plus(asset.locked ?? 0)
              .minus(asset.borrowed ?? 0)
              .minus(asset.interest ?? 0);
        remoteBalances.set(String(asset.asset).toUpperCase(), amount);
      }
    } else if (typeName.includes('aislado') || typeName.includes('isolated')) {
      scope = 'MARGIN_ISOLATED';
      const balances = await this.binanceService.getIsolatedMarginBalances();
      for (const pairAsset of balances) {
        for (const asset of [pairAsset.baseAsset, pairAsset.quoteAsset]) {
          if (!asset?.asset) {
            continue;
          }

          const amount = asset.netAsset !== undefined
            ? this.toDecimal(asset.netAsset)
            : this.toDecimal(asset.free ?? 0)
                .plus(asset.locked ?? 0)
                .minus(asset.borrowed ?? 0)
                .minus(asset.interest ?? 0);

          const currencyCode = String(asset.asset).toUpperCase();
          const existing = remoteBalances.get(currencyCode) ?? new Prisma.Decimal(0);
          remoteBalances.set(currencyCode, existing.plus(amount));
        }
      }
    } else {
      throw new BadRequestException(
        `La cuenta ${accountId} tiene tipo ${account.bankAccountType?.typeName} y no se puede mapear automáticamente a Binance.`,
      );
    }

    return {
      account,
      scope,
      localBalances,
      remoteBalances,
    };
  }

  private async resolveOffsetAccount(sourceAccountId: number, requestedOffsetAccountId?: number) {
    const sourceAccount = await this.prisma.account.findUnique({
      where: { id: sourceAccountId },
      include: { bankAccountType: true, accountBalances: true },
    });

    if (!sourceAccount) {
      throw new NotFoundException(`Cuenta origen ${sourceAccountId} no encontrada.`);
    }

    if (requestedOffsetAccountId) {
      if (requestedOffsetAccountId === sourceAccountId) {
        throw new BadRequestException('La cuenta origen y la cuenta contrapartida no deben ser la misma.');
      }

      const explicitOffsetAccount = await this.prisma.account.findUnique({
        where: { id: requestedOffsetAccountId },
        include: { bankAccountType: true },
      });

      if (!explicitOffsetAccount) {
        throw new NotFoundException(
          `Cuenta contrapartida ${requestedOffsetAccountId} no encontrada. Usa una cuenta existente para reflejo contable.`,
        );
      }

      return { sourceAccount, offsetAccount: explicitOffsetAccount };
    }

    const automaticOffsetAccount = await this.prisma.account.findFirst({
      where: {
        userId: sourceAccount.userId,
        key: this.binanceSyncOffsetKey,
        email: this.binanceSyncOffsetEmail,
      },
      include: { bankAccountType: true },
    });

    if (!automaticOffsetAccount) {
      throw new NotFoundException(
        'No existe la cuenta técnica de ajuste Binance. Ejecuta el seed actualizado o envía offsetAccountId manualmente.',
      );
    }

    if (automaticOffsetAccount.id === sourceAccount.id) {
      throw new BadRequestException('La cuenta técnica de ajuste no puede ser la misma cuenta sincronizada.');
    }

    return { sourceAccount, offsetAccount: automaticOffsetAccount };
  }

  async create(createJournalEntryDto: CreateJournalEntryDto) {
    await this.validateDto(createJournalEntryDto);
    this.validateBalancedLines(createJournalEntryDto.lines);

    try {
      if (createJournalEntryDto.lines.length === 0) {
        throw new BadRequestException('Debe proporcionar al menos una línea para la entrada');
      }
      const createdEntry = await this.prisma.$transaction(async (tx) => {
        await this.ensureAccountsExist(tx, createJournalEntryDto.lines.map(line => line.accountId));
        await this.ensureCurrenciesExist(tx, createJournalEntryDto.lines.map(line => line.currencyCode));

        return await tx.journalEntry.create({
          data: {
            entryDate: createJournalEntryDto.entryDate,
            description: createJournalEntryDto.description,
            createdBy: createJournalEntryDto.createdBy,
            statusId: createJournalEntryDto.statusId ?? 1,
            lines: {
              create: createJournalEntryDto.lines.map(line => ({
                accountId: line.accountId,
                currencyCode: line.currencyCode.trim().toUpperCase(),
                amount: line.amount,
                entryType: this.normalizeEntryType(line.entryType),
              })),
            },
          },
          include: { lines: true, status: true, transfer: true },
        });
      });

      await this.executeBalanceProcedure(this.prisma);
      return createdEntry;
    } catch (error) {
      this.handlePrismaError(error, 'Error creando una entrada del diario');
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

  async findOneJournalEntry(id: number) {
    if (!id) throw new BadRequestException('ID es requerido');
    try {
      const journalEntry = await this.prisma.journalEntry.findUnique({
        where: { id },
        include: { lines: true, status: true, transfer: true },
      });
      if (!journalEntry) throw new NotFoundException(`Entrada del diario con id ${id} no encontrada.`);
      return journalEntry;
    } catch (error) {
      this.handlePrismaError(error, `Error buscando la entrada del diario con id ${id}`);
    }
  }

  async update(id: number, updateJournalEntryDto: UpdateJournalEntryDto) {
    if (!id) throw new BadRequestException('ID es requerido');
    await this.validateDto(updateJournalEntryDto);
    if (updateJournalEntryDto.lines) {
      this.validateBalancedLines(updateJournalEntryDto.lines);
    }
    const prismaData = this.mapUpdateEntryDtoToPrisma(updateJournalEntryDto);
    try {
      const updatedEntry = await this.prisma.$transaction(async (tx) => {
        const existingEntry = await tx.journalEntry.findUnique({
          where: { id },
          include: { lines: true },
        });

        if (!existingEntry) {
          throw new NotFoundException(`Entrada del diario con id ${id} no encontrada.`);
        }

        if (updateJournalEntryDto.lines) {
          await this.ensureAccountsExist(tx, updateJournalEntryDto.lines.map(line => line.accountId));
          await this.ensureCurrenciesExist(tx, updateJournalEntryDto.lines.map(line => line.currencyCode));
        }

        return await tx.journalEntry.update({
          where: { id },
          data: {
            ...prismaData,
            lines: updateJournalEntryDto.lines
              ? {
                  deleteMany: {},
                  create: updateJournalEntryDto.lines.map(line => ({
                    accountId: line.accountId,
                    currencyCode: line.currencyCode.trim().toUpperCase(),
                    amount: line.amount,
                    entryType: this.normalizeEntryType(line.entryType),
                  })),
                }
              : undefined,
          },
          include: { lines: true },
        });
      });

      await this.executeBalanceProcedure(this.prisma);
      return updatedEntry;
    } catch (error) {
      this.handlePrismaError(error, `Error actualizando entrada del diario con id ${id}`);
    }
  }

  async remove(id: number) {
    if (!id) throw new BadRequestException('ID es requerido');
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.journalEntryLine.deleteMany({ where: { entryId: id } });
        const deletedEntry = await tx.journalEntry.delete({ where: { id } });
        return { message: `Entrada del diario con id ${id} eliminada.`, deletedEntry };
      });

      await this.executeBalanceProcedure(this.prisma);
      return result;
    } catch (error) {
      this.handlePrismaError(error, `Error eliminando entrada del diario con id ${id}`);
    }
  }

  async createLine(createLineDto: CreateJournalEntryLineDto & { entryId: number }) {
    try {
      const createdLine = await this.prisma.$transaction(async (tx) => {
        const existingEntry = await tx.journalEntry.findUnique({
          where: { id: createLineDto.entryId },
          include: { lines: true },
        });

        if (!existingEntry) {
          throw new NotFoundException(`Entrada del diario con id ${createLineDto.entryId} no encontrada.`);
        }

        const nextLines = [...existingEntry.lines, {
          accountId: createLineDto.accountId,
          currencyCode: createLineDto.currencyCode,
          amount: createLineDto.amount,
          entryType: createLineDto.entryType,
        }];

        this.validateBalancedLines(nextLines);
        await this.ensureAccountsExist(tx, [createLineDto.accountId]);
        await this.ensureCurrenciesExist(tx, [createLineDto.currencyCode]);

        return await tx.journalEntryLine.create({
          data: this.mapCreateLineDtoToPrisma(createLineDto),
        });
      });

      await this.executeBalanceProcedure(this.prisma);
      return createdLine;
    } catch (error) {
      this.handlePrismaError(error, 'Error creando línea del asiento contable');
    }
  }

  async findAllLines(entryId?: number) {
    try {
      const where = entryId ? { entryId } : {};
      return await this.prisma.journalEntryLine.findMany({ where });
    } catch (error) {
      this.handlePrismaError(error, 'Error obteniendo líneas del asiento contable');
    }
  }

  async findOneLine(id: number) {
    try {
      const line = await this.prisma.journalEntryLine.findUnique({ where: { id } });
      if (!line) throw new NotFoundException(`Línea del asiento con id ${id} no encontrada.`);
      return line;
    } catch (error) {
      this.handlePrismaError(error, `Error buscando línea con id ${id}`);
    }
  }

  async updateLine(id: number, updateLineDto: any) {
    try {
      const updatedLine = await this.prisma.$transaction(async (tx) => {
        const currentLine = await tx.journalEntryLine.findUnique({ where: { id } });
        if (!currentLine) {
          throw new NotFoundException(`Línea del asiento con id ${id} no encontrada.`);
        }

        const data = this.mapUpdateLineDtoToPrisma(updateLineDto);
        const entryLines = await this.getEntryLinesOrFail(currentLine.entryId, tx);
        const nextLines = entryLines.map(line =>
          line.id === id
            ? {
                ...line,
                ...data,
                amount: data.amount ?? line.amount,
                currencyCode: data.currencyCode ?? line.currencyCode,
                entryType: data.entryType ?? line.entryType,
              }
            : line,
        );

        this.validateBalancedLines(nextLines);
        if (data.accountId) {
          await this.ensureAccountsExist(tx, [data.accountId]);
        }
        if (data.currencyCode) {
          await this.ensureCurrenciesExist(tx, [data.currencyCode]);
        }

        return await tx.journalEntryLine.update({ where: { id }, data });
      });

      await this.executeBalanceProcedure(this.prisma);
      return updatedLine;
    } catch (error) {
      this.handlePrismaError(error, `Error actualizando línea con id ${id}`);
    }
  }

  async removeLine(id: number) {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const currentLine = await tx.journalEntryLine.findUnique({ where: { id } });
        if (!currentLine) {
          throw new NotFoundException(`Línea del asiento con id ${id} no encontrada.`);
        }

        const entryLines = await this.getEntryLinesOrFail(currentLine.entryId, tx);
        const remainingLines = entryLines.filter(line => line.id !== id);
        this.validateBalancedLines(remainingLines);

        const deleted = await tx.journalEntryLine.delete({ where: { id } });
        return { message: `Línea con id ${id} eliminada.`, deleted };
      });

      await this.executeBalanceProcedure(this.prisma);
      return result;
    } catch (error) {
      this.handlePrismaError(error, `Error eliminando línea con id ${id}`);
    }
  }

  async getAccountingSummary() {
    try {
      const [entries, balances, tradingStatusSummary, tradingProfit] = await Promise.all([
        this.prisma.journalEntry.findMany({
          include: { lines: true, status: true },
          orderBy: { entryDate: 'desc' },
        }),
        this.prisma.accountBalance.findMany({
          include: {
            account: { include: { bankAccountType: true } },
            currency: true,
          },
          orderBy: [{ accountId: 'asc' }, { currencyCode: 'asc' }],
        }),
        this.prisma.tradingOrder.groupBy({
          by: ['status'],
          _count: { id: true },
          _sum: { profit_loss: true },
        }),
        this.prisma.tradingOrder.aggregate({
          _sum: { profit_loss: true },
          where: {
            profit_loss: { not: null },
            status: 'CLOSED',
          },
        }),
      ]);

      const byCurrency = new Map<string, { ingresos: Prisma.Decimal; egresos: Prisma.Decimal }>();

      for (const entry of entries) {
        for (const line of entry.lines) {
          const currencyCode = line.currencyCode.toUpperCase();
          const current = byCurrency.get(currencyCode) ?? {
            ingresos: new Prisma.Decimal(0),
            egresos: new Prisma.Decimal(0),
          };

          if (this.normalizeEntryType(line.entryType) === EntryType.INGRESO) {
            current.ingresos = current.ingresos.plus(line.amount);
          } else {
            current.egresos = current.egresos.plus(line.amount);
          }

          byCurrency.set(currencyCode, current);
        }
      }

      let binanceMarginSummary: unknown = null;
      try {
        binanceMarginSummary = await this.binanceService.getCrossMarginPNLSummary();
      } catch (error) {
        this.logger.warn('No se pudo obtener el resumen de PNL de margin cruzado desde Binance.');
      }

      return {
        journalEntries: {
          total: entries.length,
          byCurrency: [...byCurrency.entries()].map(([currencyCode, totals]) => ({
            currencyCode,
            ingresos: totals.ingresos.toString(),
            egresos: totals.egresos.toString(),
            neto: totals.ingresos.minus(totals.egresos).toString(),
          })),
          latestEntries: entries.slice(0, 10),
        },
        balances: balances.map(balance => ({
          accountId: balance.accountId,
          accountType: balance.account.bankAccountType.typeName,
          currencyCode: balance.currencyCode,
          balance: balance.balance.toString(),
        })),
        trading: {
          realizedClosedProfitLoss: tradingProfit._sum.profit_loss?.toString() ?? '0',
          byStatus: tradingStatusSummary.map(item => ({
            status: item.status,
            count: item._count.id,
            profitLoss: item._sum.profit_loss?.toString() ?? '0',
          })),
          binanceCrossMargin: binanceMarginSummary,
        },
      };
    } catch (error) {
      this.handlePrismaError(error, 'Error obteniendo resumen contable');
    }
  }

  async syncBinanceBalances(syncDto: SyncBinanceBalancesDto) {
    await this.validateDto(syncDto);

    const { sourceAccount, offsetAccount } = await this.resolveOffsetAccount(
      syncDto.accountId,
      syncDto.offsetAccountId,
    );

    const {
      account,
      scope,
      localBalances,
      remoteBalances,
    } = await this.buildRemoteBalancesForAccountType(syncDto.accountId);

    const includeZeroBalances = syncDto.includeZeroBalances ?? true;
    const currencies = new Set<string>(remoteBalances.keys());

    if (includeZeroBalances) {
      for (const currencyCode of localBalances.keys()) {
        currencies.add(currencyCode);
      }
    }

    const lines: CreateJournalEntryDto['lines'] = [];
    const adjustments: Array<{
      currencyCode: string;
      localBalance: string;
      remoteBalance: string;
      difference: string;
    }> = [];

    for (const currencyCode of currencies) {
      const localBalance = localBalances.get(currencyCode) ?? new Prisma.Decimal(0);
      const remoteBalance = remoteBalances.get(currencyCode) ?? new Prisma.Decimal(0);
      const difference = remoteBalance.minus(localBalance);

      if (difference.equals(0)) {
        continue;
      }

      const amount = difference.abs().toString();
      const primaryEntryType = difference.gt(0) ? EntryType.INGRESO : EntryType.EGRESO;
      const offsetEntryType = difference.gt(0) ? EntryType.EGRESO : EntryType.INGRESO;

      lines.push({
        accountId: syncDto.accountId,
        currencyCode,
        amount,
        entryType: primaryEntryType,
      });

      lines.push({
        accountId: offsetAccount.id,
        currencyCode,
        amount,
        entryType: offsetEntryType,
      });

      adjustments.push({
        currencyCode,
        localBalance: localBalance.toString(),
        remoteBalance: remoteBalance.toString(),
        difference: difference.toString(),
      });
    }

    if (lines.length === 0) {
      return {
        message: 'No hubo diferencias entre Binance y los balances locales.',
        accountId: syncDto.accountId,
        scope,
        adjustments: [],
      };
    }

    const descriptionParts = [
      `[BINANCE_REFLECTION][${scope}] Sync de balance para cuenta ${account.id}`,
      syncDto.description,
    ].filter(Boolean);

    const createdEntry = await this.create({
      entryDate: new Date().toISOString(),
      description: descriptionParts.join(' | '),
      createdBy: syncDto.createdBy ?? 'BINANCE_SYNC',
      statusId: 1,
      lines,
    });

    return {
      message: 'Saldos de Binance sincronizados a local y registrados en journal entry.',
      scope,
      accountId: syncDto.accountId,
      offsetAccountId: offsetAccount.id,
      journalEntryId: createdEntry?.id,
      adjustments,
    };
  }

  private mapCreateEntryDtoToPrisma(createDto: CreateJournalEntryDto) {
    return {
      entryDate: createDto.entryDate,
      description: createDto.description,
      createdBy: createDto.createdBy,
      status: createDto.statusId ? { connect: { id: createDto.statusId } } : undefined,
      lines: {
        create: createDto.lines.map(line => ({
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
      status: updateDto.statusId ? { connect: { id: updateDto.statusId } } : undefined,
    };
  }

  private mapUpdateLineDtoToPrisma(updateDto: UpdateJournalEntryLineDto) {
    return {
      accountId: updateDto.accountId,
      currencyCode: updateDto.currencyCode?.trim().toUpperCase(),
      amount: updateDto.amount,
      entryType: updateDto.entryType ? this.normalizeEntryType(updateDto.entryType) : undefined,
    };
  }
}
