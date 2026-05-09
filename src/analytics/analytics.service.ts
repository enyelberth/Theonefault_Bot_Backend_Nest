import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import { PnlLedgerService } from '../pnl-ledger/pnl-ledger.service';
import { StrategiesTradingService } from '../strategies-trading/strategies-trading.service';

type Granularity = 'day' | 'week' | 'month';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: ObservabilityService,
    private readonly pnlLedger: PnlLedgerService,
    private readonly strategiesTrading: StrategiesTradingService,
  ) {}

  private toDecimal(
    value: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal {
    if (value === null || value === undefined) {
      return new Prisma.Decimal(0);
    }
    return new Prisma.Decimal(value);
  }

  private parseDate(value?: string, fieldName = 'date'): Date | undefined {
    if (!value) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${fieldName} invalida: ${value}`);
    }

    return parsed;
  }

  private normalizeRange(from?: string, to?: string) {
    const fromDate = this.parseDate(from, 'from');
    const toDate = this.parseDate(to, 'to');

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException(
        'El rango es invalido: from no puede ser mayor que to.',
      );
    }

    return { fromDate, toDate };
  }

  private getPeriodKey(date: Date, granularity: Granularity): string {
    const utcYear = date.getUTCFullYear();
    const utcMonth = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const utcDay = `${date.getUTCDate()}`.padStart(2, '0');

    if (granularity === 'day') {
      return `${utcYear}-${utcMonth}-${utcDay}`;
    }

    if (granularity === 'month') {
      return `${utcYear}-${utcMonth}`;
    }

    const startOfYear = Date.UTC(utcYear, 0, 1);
    const dayNumber =
      Math.floor(
        (Date.UTC(utcYear, date.getUTCMonth(), date.getUTCDate()) -
          startOfYear) /
          86400000,
      ) + 1;
    const week = Math.ceil(dayNumber / 7);
    return `${utcYear}-W${String(week).padStart(2, '0')}`;
  }

  private resolveGranularity(value?: string): Granularity {
    if (!value) {
      return 'day';
    }

    if (value === 'day' || value === 'week' || value === 'month') {
      return value;
    }

    throw new BadRequestException(
      'granularity invalida. Usa day, week o month.',
    );
  }

  private async validateBaseCurrency(baseCurrency?: string): Promise<string> {
    const normalized = (baseCurrency ?? 'USDT').trim().toUpperCase();
    const currency = await this.prisma.currency.findUnique({
      where: { code: normalized },
    });
    if (!currency) {
      throw new BadRequestException(
        `baseCurrency invalida o inexistente: ${normalized}`,
      );
    }
    return normalized;
  }

  private normalizePagination(page?: number, pageSize?: number) {
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(200, Math.max(1, pageSize ?? 25));
    const skip = (safePage - 1) * safePageSize;
    return { page: safePage, pageSize: safePageSize, skip };
  }

  private async getOrdersForRange(
    from?: string,
    to?: string,
    accountId?: number,
    symbol?: string,
    strategy?: string,
  ) {
    const { fromDate, toDate } = this.normalizeRange(from, to);

    const strategySymbols = strategy
      ? (
          await this.prisma.tradingStrategy.findMany({
            where: {
              OR: [{ strategyType: strategy }, { type: { name: strategy } }],
            },
            select: { symbol: true },
          })
        ).map((item) => item.symbol)
      : undefined;

    return this.prisma.tradingOrder.findMany({
      where: {
        accountId: accountId ? accountId : undefined,
        symbol: symbol ? symbol.toUpperCase() : undefined,
        ...(strategySymbols ? { symbol: { in: strategySymbols } } : {}),
        closed_time: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        id: true,
        symbol: true,
        status: true,
        side: true,
        closed_time: true,
        profit_loss: true,
      },
      orderBy: {
        closed_time: 'asc',
      },
    });
  }

  async getSummary(accountId?: number, baseCurrency?: string) {
    const normalizedBase = await this.validateBaseCurrency(baseCurrency);

    const [orders, lines, balances] = await Promise.all([
      this.prisma.tradingOrder.findMany({
        where: {
          accountId: accountId ? accountId : undefined,
          profit_loss: { not: null },
        },
        select: {
          status: true,
          profit_loss: true,
        },
      }),
      this.prisma.journalEntryLine.findMany({
        where: {
          accountId: accountId ? accountId : undefined,
        },
        select: {
          currencyCode: true,
          amount: true,
          entryType: true,
        },
      }),
      this.prisma.accountBalance.findMany({
        where: {
          accountId: accountId ? accountId : undefined,
        },
        select: {
          accountId: true,
          currencyCode: true,
          balance: true,
        },
      }),
    ]);

    let totalRealized = new Prisma.Decimal(0);
    let totalUnrealized = new Prisma.Decimal(0);
    let wins = 0;
    let losses = 0;

    for (const order of orders) {
      const pnl = this.toDecimal(order.profit_loss);
      if (order.status === 'CLOSED') {
        totalRealized = totalRealized.plus(pnl);
      } else {
        totalUnrealized = totalUnrealized.plus(pnl);
      }

      if (pnl.gt(0)) {
        wins += 1;
      }
      if (pnl.lt(0)) {
        losses += 1;
      }
    }

    const byCurrency = new Map<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal }
    >();
    for (const line of lines) {
      const key = line.currencyCode.toUpperCase();
      const current = byCurrency.get(key) ?? {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      };

      const upperType = line.entryType.toUpperCase();
      if (['INGRESO', 'DEBIT', 'DEBITO', 'DÉBITO'].includes(upperType)) {
        current.income = current.income.plus(line.amount);
      } else {
        current.expense = current.expense.plus(line.amount);
      }

      byCurrency.set(key, current);
    }

    const closedCount = orders.filter(
      (order) => order.status === 'CLOSED',
    ).length;

    return {
      baseCurrency: normalizedBase,
      trading: {
        closedOrders: closedCount,
        totalOrdersWithPnl: orders.length,
        winRate:
          closedCount > 0 ? Number(((wins / closedCount) * 100).toFixed(2)) : 0,
        wins,
        losses,
        realizedProfitLoss: totalRealized.toString(),
        unrealizedProfitLoss: totalUnrealized.toString(),
      },
      accounting: {
        byCurrency: [...byCurrency.entries()].map(([currencyCode, values]) => ({
          currencyCode,
          income: values.income.toString(),
          expense: values.expense.toString(),
          net: values.income.minus(values.expense).toString(),
        })),
      },
      balances,
    };
  }

  async getPnlTimeSeries(
    granularityInput?: string,
    from?: string,
    to?: string,
    accountId?: number,
    symbol?: string,
    strategy?: string,
  ) {
    const granularity = this.resolveGranularity(granularityInput);
    const orders = await this.getOrdersForRange(
      from,
      to,
      accountId,
      symbol,
      strategy,
    );

    const grouped = new Map<string, Prisma.Decimal>();
    for (const order of orders) {
      if (!order.closed_time) {
        continue;
      }

      const key = this.getPeriodKey(order.closed_time, granularity);
      const current = grouped.get(key) ?? new Prisma.Decimal(0);
      grouped.set(key, current.plus(this.toDecimal(order.profit_loss)));
    }

    let cumulative = new Prisma.Decimal(0);
    return [...grouped.entries()].map(([period, value]) => {
      cumulative = cumulative.plus(value);
      return {
        period,
        realizedPnl: value.toString(),
        cumulativePnl: cumulative.toString(),
      };
    });
  }

  async getIncomeExpenseSeries(
    granularityInput?: string,
    from?: string,
    to?: string,
    accountId?: number,
  ) {
    const granularity = this.resolveGranularity(granularityInput);
    const { fromDate, toDate } = this.normalizeRange(from, to);

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountId: accountId ? accountId : undefined,
        journalEntry: {
          entryDate: {
            gte: fromDate,
            lte: toDate,
          },
        },
      },
      select: {
        amount: true,
        entryType: true,
        currencyCode: true,
        journalEntry: {
          select: {
            entryDate: true,
          },
        },
      },
      orderBy: {
        journalEntry: {
          entryDate: 'asc',
        },
      },
    });

    const grouped = new Map<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal }
    >();
    for (const line of lines) {
      const period = this.getPeriodKey(
        line.journalEntry.entryDate,
        granularity,
      );
      const current = grouped.get(period) ?? {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      };

      const upperType = line.entryType.toUpperCase();
      if (['INGRESO', 'DEBIT', 'DEBITO', 'DÉBITO'].includes(upperType)) {
        current.income = current.income.plus(line.amount);
      } else {
        current.expense = current.expense.plus(line.amount);
      }
      grouped.set(period, current);
    }

    return [...grouped.entries()].map(([period, value]) => ({
      period,
      income: value.income.toString(),
      expense: value.expense.toString(),
      net: value.income.minus(value.expense).toString(),
    }));
  }

  async getBySymbol(from?: string, to?: string, accountId?: number) {
    const orders = await this.getOrdersForRange(from, to, accountId);

    const grouped = new Map<string, { count: number; pnl: Prisma.Decimal }>();
    for (const order of orders) {
      const current = grouped.get(order.symbol) ?? {
        count: 0,
        pnl: new Prisma.Decimal(0),
      };
      current.count += 1;
      current.pnl = current.pnl.plus(this.toDecimal(order.profit_loss));
      grouped.set(order.symbol, current);
    }

    return [...grouped.entries()].map(([symbol, value]) => ({
      symbol,
      trades: value.count,
      pnl: value.pnl.toString(),
    }));
  }

  async getByStrategy(from?: string, to?: string, accountId?: number) {
    const [orders, strategies] = await Promise.all([
      this.getOrdersForRange(from, to, accountId),
      this.prisma.tradingStrategy.findMany({
        select: {
          symbol: true,
          strategyType: true,
          type: {
            select: { name: true },
          },
        },
      }),
    ]);

    const symbolToStrategy = new Map<string, string>();
    for (const strategy of strategies) {
      symbolToStrategy.set(
        strategy.symbol,
        strategy.strategyType || strategy.type.name || 'unknown',
      );
    }

    const grouped = new Map<string, { count: number; pnl: Prisma.Decimal }>();
    for (const order of orders) {
      const strategyName = symbolToStrategy.get(order.symbol) || 'unknown';
      const current = grouped.get(strategyName) ?? {
        count: 0,
        pnl: new Prisma.Decimal(0),
      };
      current.count += 1;
      current.pnl = current.pnl.plus(this.toDecimal(order.profit_loss));
      grouped.set(strategyName, current);
    }

    return [...grouped.entries()].map(([strategy, value]) => ({
      strategy,
      trades: value.count,
      pnl: value.pnl.toString(),
    }));
  }

  async getRiskMetrics(
    from?: string,
    to?: string,
    accountId?: number,
    symbol?: string,
    strategy?: string,
  ) {
    const series = await this.getPnlTimeSeries(
      'day',
      from,
      to,
      accountId,
      symbol,
      strategy,
    );

    const daily = series.map((item) =>
      this.toDecimal(item.realizedPnl).toNumber(),
    );
    const total = daily.reduce((acc, value) => acc + value, 0);

    let cumulative = 0;
    let peak = Number.NEGATIVE_INFINITY;
    let maxDrawdown = 0;

    for (const value of daily) {
      cumulative += value;
      peak = Math.max(peak, cumulative);
      maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
    }

    const positives = daily.filter((value) => value > 0);
    const negatives = daily.filter((value) => value < 0);

    const grossProfit = positives.reduce((acc, value) => acc + value, 0);
    const grossLoss = Math.abs(
      negatives.reduce((acc, value) => acc + value, 0),
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    const mean = daily.length > 0 ? total / daily.length : 0;
    const variance =
      daily.length > 0
        ? daily.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
          daily.length
        : 0;

    const volatility = Math.sqrt(variance);
    const sharpe = volatility > 0 ? (mean / volatility) * Math.sqrt(365) : 0;

    const downside = daily.filter((value) => value < 0);
    const downsideVariance =
      downside.length > 0
        ? downside.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
          downside.length
        : 0;

    const sortino =
      downsideVariance > 0
        ? (mean / Math.sqrt(downsideVariance)) * Math.sqrt(365)
        : 0;

    return {
      periodDays: daily.length,
      totalRealizedPnl: total,
      maxDrawdown,
      profitFactor: Number(profitFactor.toFixed(4)),
      volatility: Number(volatility.toFixed(6)),
      sharpe: Number(sharpe.toFixed(4)),
      sortino: Number(sortino.toFixed(4)),
    };
  }

  async materializeDailySnapshots(dateInput?: Date) {
    const prismaAny = this.prisma as any;
    const date = dateInput ? new Date(dateInput) : new Date();
    const dayStart = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const dayEnd = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const [balances, orders, lines] = await Promise.all([
      this.prisma.accountBalance.findMany({
        include: { account: true },
      }),
      this.prisma.tradingOrder.findMany({
        where: {
          closed_time: { gte: dayStart, lte: dayEnd },
          profit_loss: { not: null },
        },
        select: { accountId: true, profit_loss: true, status: true },
      }),
      this.prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            entryDate: { gte: dayStart, lte: dayEnd },
          },
        },
        select: {
          accountId: true,
          currencyCode: true,
          amount: true,
          entryType: true,
        },
      }),
    ]);

    const incomeExpenseMap = new Map<
      string,
      { income: Prisma.Decimal; expense: Prisma.Decimal }
    >();
    for (const line of lines) {
      const key = `${line.accountId}:${line.currencyCode.toUpperCase()}`;
      const current = incomeExpenseMap.get(key) ?? {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      };

      if (
        ['INGRESO', 'DEBIT', 'DEBITO', 'DÉBITO'].includes(
          line.entryType.toUpperCase(),
        )
      ) {
        current.income = current.income.plus(line.amount);
      } else {
        current.expense = current.expense.plus(line.amount);
      }
      incomeExpenseMap.set(key, current);
    }

    const realizedByAccount = new Map<number, Prisma.Decimal>();
    const unrealizedByAccount = new Map<number, Prisma.Decimal>();
    for (const order of orders) {
      const pnl = this.toDecimal(order.profit_loss);
      const map =
        order.status === 'CLOSED' ? realizedByAccount : unrealizedByAccount;
      map.set(
        order.accountId,
        (map.get(order.accountId) ?? new Prisma.Decimal(0)).plus(pnl),
      );
    }

    for (const balance of balances) {
      const key = `${balance.accountId}:${balance.currencyCode.toUpperCase()}`;
      const ie = incomeExpenseMap.get(key) ?? {
        income: new Prisma.Decimal(0),
        expense: new Prisma.Decimal(0),
      };
      const realized =
        realizedByAccount.get(balance.accountId) ?? new Prisma.Decimal(0);
      const unrealized =
        unrealizedByAccount.get(balance.accountId) ?? new Prisma.Decimal(0);

      await prismaAny.dailyPnlSnapshot.upsert({
        where: {
          snapshotDate_accountId_currencyCode: {
            snapshotDate: dayStart,
            accountId: balance.accountId,
            currencyCode: balance.currencyCode,
          },
        },
        create: {
          snapshotDate: dayStart,
          accountId: balance.accountId,
          currencyCode: balance.currencyCode,
          realizedPnl: realized,
          unrealizedPnl: unrealized,
          income: ie.income,
          expense: ie.expense,
          net: ie.income.minus(ie.expense),
        },
        update: {
          realizedPnl: realized,
          unrealizedPnl: unrealized,
          income: ie.income,
          expense: ie.expense,
          net: ie.income.minus(ie.expense),
        },
      });
    }

    return { snapshotDate: dayStart.toISOString(), records: balances.length };
  }

  async materializeDailyKpis(dateInput?: Date) {
    const prismaAny = this.prisma as any;
    const date = dateInput ? new Date(dateInput) : new Date();
    const dayStart = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const dayEnd = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    const risk = await this.getRiskMetrics(
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );

    const dayOrders = await this.prisma.tradingOrder.findMany({
      where: {
        closed_time: { gte: dayStart, lte: dayEnd },
        status: 'CLOSED',
      },
      select: { profit_loss: true },
    });

    const wins = dayOrders.filter((order) =>
      this.toDecimal(order.profit_loss).gt(0),
    ).length;
    const winRate = dayOrders.length > 0 ? (wins / dayOrders.length) * 100 : 0;

    await prismaAny.dailyKpi.upsert({
      where: { kpiDate: dayStart },
      create: {
        kpiDate: dayStart,
        winRate,
        profitFactor: risk.profitFactor,
        maxDrawdown: risk.maxDrawdown,
        sharpe: risk.sharpe,
        sortino: risk.sortino,
        volatility: risk.volatility,
        totalTrades: dayOrders.length,
      },
      update: {
        winRate,
        profitFactor: risk.profitFactor,
        maxDrawdown: risk.maxDrawdown,
        sharpe: risk.sharpe,
        sortino: risk.sortino,
        volatility: risk.volatility,
        totalTrades: dayOrders.length,
      },
    });

    return { kpiDate: dayStart.toISOString(), totalTrades: dayOrders.length };
  }

  @Cron('0 5 0 * * *')
  async runDailyAnalyticsJob() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      const [snapshot, kpi] = await Promise.all([
        this.materializeDailySnapshots(yesterday),
        this.materializeDailyKpis(yesterday),
      ]);

      const prismaAny = this.prisma as any;
      const recent = await prismaAny.dailyKpi.findMany({
        orderBy: { kpiDate: 'desc' },
        take: 8,
      });

      if (recent.length >= 2) {
        const latest = this.toDecimal(recent[0].maxDrawdown).abs().toNumber();
        const prevAvg =
          recent
            .slice(1)
            .reduce(
              (acc, item) =>
                acc + this.toDecimal(item.maxDrawdown).abs().toNumber(),
              0,
            ) /
          (recent.length - 1);

        if (prevAvg > 0 && latest > prevAvg * 2) {
          const adminUser = await this.prisma.user.findFirst({
            where: { role: 'ADMIN' } as any,
          });
          if (adminUser) {
            await this.prisma.notification.create({
              data: {
                userId: adminUser.id,
                title: 'Alerta de Drawdown Diario',
                message: `Drawdown de ${latest.toFixed(2)} supera 2x el promedio reciente (${prevAvg.toFixed(2)}).`,
                read: false,
              },
            });
          }
        }
      }

      this.logger.log(
        `Daily analytics job completado: ${snapshot.records} snapshots, ${kpi.totalTrades} trades analizados.`,
      );
    } catch (error) {
      this.logger.error('Fallo en job diario de analytics.', error as Error);
      const adminUser = await this.prisma.user.findFirst({
        where: { role: 'ADMIN' } as any,
      });
      if (adminUser) {
        await this.prisma.notification.create({
          data: {
            userId: adminUser.id,
            title: 'Fallo en Job de Analytics',
            message: `Error en job diario: ${error instanceof Error ? error.message : 'unknown'}`,
            read: false,
          },
        });
      }
    }
  }

  async getDashboard(params: {
    from?: string;
    to?: string;
    accountId?: number;
    baseCurrency?: string;
    symbol?: string;
    strategy?: string;
    granularity?: string;
    page?: number;
    pageSize?: number;
  }) {
    const {
      from,
      to,
      accountId,
      baseCurrency,
      symbol,
      strategy,
      granularity,
      page,
      pageSize,
    } = params;

    const normalizedBase = await this.validateBaseCurrency(baseCurrency);
    const pagination = this.normalizePagination(page, pageSize);

    const prismaAny = this.prisma as any;
    const [
      summary,
      pnlSeries,
      incomeExpense,
      bySymbolAll,
      byStrategyAll,
      risk,
      snapshots,
    ] = await Promise.all([
      this.getSummary(accountId, normalizedBase),
      this.getPnlTimeSeries(
        granularity ?? 'day',
        from,
        to,
        accountId,
        symbol,
        strategy,
      ),
      this.getIncomeExpenseSeries(granularity ?? 'day', from, to, accountId),
      this.getBySymbol(from, to, accountId),
      this.getByStrategy(from, to, accountId),
      this.getRiskMetrics(from, to, accountId, symbol, strategy),
      prismaAny.dailyPnlSnapshot.findMany({
        where: {
          accountId: accountId ? accountId : undefined,
          currencyCode: normalizedBase,
          snapshotDate: {
            gte: this.parseDate(from, 'from'),
            lte: this.parseDate(to, 'to'),
          },
        },
        orderBy: { snapshotDate: 'asc' },
      }),
    ]);

    const bySymbol = bySymbolAll.slice(
      pagination.skip,
      pagination.skip + pagination.pageSize,
    );
    const byStrategy = byStrategyAll.slice(
      pagination.skip,
      pagination.skip + pagination.pageSize,
    );

    return {
      summary,
      filters: {
        from,
        to,
        accountId,
        baseCurrency: normalizedBase,
        symbol,
        strategy,
        granularity: granularity ?? 'day',
      },
      pagination,
      charts: {
        pnlSeries,
        incomeExpense,
        bySymbol,
        byStrategy,
        snapshots: snapshots.map((item) => ({
          snapshotDate: item.snapshotDate,
          net: item.net.toString(),
          income: item.income.toString(),
          expense: item.expense.toString(),
          realizedPnl: item.realizedPnl.toString(),
          unrealizedPnl: item.unrealizedPnl.toString(),
        })),
      },
      totals: {
        bySymbol: bySymbolAll.length,
        byStrategy: byStrategyAll.length,
      },
      risk,
      generatedAt: new Date().toISOString(),
    };
  }

  async exportDashboardCsv(params: {
    from?: string;
    to?: string;
    accountId?: number;
    baseCurrency?: string;
    symbol?: string;
    strategy?: string;
    granularity?: string;
  }) {
    const dashboard = await this.getDashboard({
      ...params,
      page: 1,
      pageSize: 200,
    });

    const rows: string[] = [];
    rows.push('section,key1,key2,value1,value2,value3');

    for (const item of dashboard.charts.pnlSeries) {
      rows.push(
        `pnlSeries,${item.period},,${item.realizedPnl},${item.cumulativePnl},`,
      );
    }

    for (const item of dashboard.charts.incomeExpense) {
      rows.push(
        `incomeExpense,${item.period},,${item.income},${item.expense},${item.net}`,
      );
    }

    for (const item of dashboard.charts.bySymbol) {
      rows.push(`bySymbol,${item.symbol},,${item.trades},${item.pnl},`);
    }

    for (const item of dashboard.charts.byStrategy) {
      rows.push(`byStrategy,${item.strategy},,${item.trades},${item.pnl},`);
    }

    for (const item of dashboard.charts.snapshots) {
      rows.push(
        `snapshots,${new Date(item.snapshotDate).toISOString()},,${item.net},${item.realizedPnl},${item.unrealizedPnl}`,
      );
    }

    return rows.join('\n');
  }

  getRuntimeMetrics() {
    return this.observability.getMetricsSnapshot();
  }

  async getPeriodComparison(accountId?: number) {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
      ),
    );
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekStart = new Date(
      todayStart.getTime() - 14 * 24 * 60 * 60 * 1000,
    );

    const [today, yesterday, week, prevWeek] = await Promise.all([
      this.getRiskMetrics(
        todayStart.toISOString(),
        now.toISOString(),
        accountId,
      ),
      this.getRiskMetrics(
        yesterdayStart.toISOString(),
        todayStart.toISOString(),
        accountId,
      ),
      this.getRiskMetrics(
        weekStart.toISOString(),
        now.toISOString(),
        accountId,
      ),
      this.getRiskMetrics(
        prevWeekStart.toISOString(),
        weekStart.toISOString(),
        accountId,
      ),
    ]);

    return { today, yesterday, week, prevWeek };
  }

  async getBenchmark(accountId?: number) {
    const orders = await this.prisma.tradingOrder.findMany({
      where: { accountId: accountId ?? undefined, profit_loss: { not: null } },
      select: { accountId: true, symbol: true, profit_loss: true },
    });

    const grouped = new Map<string, number>();
    for (const order of orders) {
      const key = `${order.accountId}:${order.symbol}`;
      grouped.set(
        key,
        (grouped.get(key) ?? 0) + Number(order.profit_loss ?? 0),
      );
    }

    return [...grouped.entries()]
      .map(([key, totalPnl]) => {
        const [accountIdValue, symbol] = key.split(':');
        return { accountId: Number(accountIdValue), symbol, totalPnl };
      })
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }

  async getHeatmap(accountId?: number) {
    const orders = await this.prisma.tradingOrder.findMany({
      where: {
        accountId: accountId ?? undefined,
        closed_time: { not: null },
        profit_loss: { not: null },
      },
      select: { closed_time: true, profit_loss: true },
    });

    const heatmap = new Map<string, number>();
    for (const order of orders) {
      if (!order.closed_time) {
        continue;
      }
      const day = order.closed_time.getUTCDay();
      const hour = order.closed_time.getUTCHours();
      const key = `${day}:${hour}`;
      heatmap.set(
        key,
        (heatmap.get(key) ?? 0) + Number(order.profit_loss ?? 0),
      );
    }

    return [...heatmap.entries()].map(([key, totalPnl]) => {
      const [dayOfWeek, hour] = key.split(':');
      return { dayOfWeek: Number(dayOfWeek), hourUtc: Number(hour), totalPnl };
    });
  }

  async getCohorts(accountId?: number) {
    const orders = await this.prisma.tradingOrder.findMany({
      where: {
        accountId: accountId ?? undefined,
        closed_time: { not: null },
        profit_loss: { not: null },
      },
      select: {
        symbol: true,
        client_order_id: true,
        profit_loss: true,
        closed_time: true,
      },
    });

    const cohorts = new Map<string, { trades: number; pnl: number }>();
    for (const order of orders) {
      const cohort = order.client_order_id.startsWith('paper:')
        ? 'paper'
        : order.symbol;
      const current = cohorts.get(cohort) ?? { trades: 0, pnl: 0 };
      current.trades += 1;
      current.pnl += Number(order.profit_loss ?? 0);
      cohorts.set(cohort, current);
    }

    return [...cohorts.entries()].map(([cohort, value]) => ({
      cohort,
      ...value,
    }));
  }

  async getDrilldown(accountId?: number, symbol?: string) {
    const [orders, journalEntries] = await Promise.all([
      this.prisma.tradingOrder.findMany({
        where: {
          accountId: accountId ?? undefined,
          symbol: symbol ?? undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.journalEntry.findMany({
        where: {
          lines: accountId ? { some: { accountId } } : undefined,
        },
        include: { lines: true },
        orderBy: { entryDate: 'desc' },
        take: 100,
      }),
    ]);

    return {
      orders,
      journalEntries,
    };
  }

  async getStrategyAdvancedPerformance(
    strategyId: string,
    from?: string,
    to?: string,
  ) {
    const { fromDate, toDate } = this.normalizeRange(from, to);
    const filters = { strategyId, closedAtGte: fromDate, closedAtLte: toDate };

    const [tradeHistory, tradeSummary, strategyMetrics] = await Promise.all([
      this.pnlLedger.getAllTradeHistory(filters),
      this.pnlLedger.getTradeSummary(filters),
      this.strategiesTrading.getStrategyMetrics(strategyId, from, to),
    ]);

    if (!tradeSummary || !strategyMetrics) {
      return {
        strategyId,
        period: { from: fromDate?.toISOString(), to: toDate?.toISOString() },
        summary: null,
        streaks: null,
        advanced: null,
        recentTrades: [],
      };
    }

    const trades = tradeHistory || [];
    const winRate = parseFloat(tradeSummary.winRate.toString());
    const totalNetPnl = parseFloat(tradeSummary.totalNetPnl.toString());
    const avgPnl = parseFloat(tradeSummary.avgPnl.toString());
    const largestWin = parseFloat(tradeSummary.maxPnl.toString());
    const largestLoss = parseFloat(tradeSummary.minPnl.toString());
    const totalTrades = tradeSummary.totalTrades;

    const streaks = this.calculateStreaks(trades);
    const avgHoldingMinutes = this.calculateAvgHoldingMinutes(trades);
    const recoveryFactor = this.calculateRecoveryFactor(
      totalNetPnl,
      strategyMetrics.maxDrawdown || 0,
    );
    const expectancy =
      winRate * largestWin + (1 - winRate) * largestLoss;
    const profitFactor = this.calculateProfitFactor(trades);

    const recentTrades = trades.slice(-10).reverse();

    return {
      strategyId,
      period: { from: fromDate?.toISOString(), to: toDate?.toISOString() },
      summary: {
        totalTrades,
        winRate: (winRate * 100).toFixed(2) + '%',
        totalPnl: totalNetPnl.toFixed(2),
        totalNetPnl: totalNetPnl.toFixed(2),
        avgPnl: avgPnl.toFixed(2),
        largestWin: largestWin.toFixed(2),
        largestLoss: largestLoss.toFixed(2),
      },
      streaks: {
        maxConsecutiveWins: streaks.maxConsecutiveWins,
        maxConsecutiveLosses: streaks.maxConsecutiveLosses,
        currentStreak: streaks.currentStreak,
      },
      advanced: {
        expectancy: expectancy.toFixed(2),
        recoveryFactor: recoveryFactor.toFixed(2),
        avgHoldingMinutes: avgHoldingMinutes.toFixed(0),
        profitFactor: profitFactor.toFixed(2),
      },
      recentTrades,
    };
  }

  private calculateStreaks(
    trades: any[],
  ): { maxConsecutiveWins: number; maxConsecutiveLosses: number; currentStreak: number } {
    if (!trades || trades.length === 0) {
      return {
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        currentStreak: 0,
      };
    }

    let maxWins = 0,
      maxLosses = 0,
      currentWins = 0,
      currentLosses = 0,
      currentStreak = 0;

    for (const trade of trades) {
      const pnl = parseFloat(trade.realizedPnl?.toString() || '0');
      if (pnl > 0) {
        currentWins++;
        currentLosses = 0;
        currentStreak++;
        maxWins = Math.max(maxWins, currentWins);
      } else if (pnl < 0) {
        currentLosses++;
        currentWins = 0;
        currentStreak--;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }

    return {
      maxConsecutiveWins: maxWins,
      maxConsecutiveLosses: maxLosses,
      currentStreak,
    };
  }

  private calculateAvgHoldingMinutes(trades: any[]): number {
    if (!trades || trades.length === 0) return 0;

    const totalMinutes = trades.reduce((acc, trade) => {
      const entry = new Date(trade.closedAt).getTime();
      const exit = new Date(trade.closedAt).getTime();
      const minutes = (exit - entry) / (1000 * 60);
      return acc + minutes;
    }, 0);

    return totalMinutes / trades.length;
  }

  private calculateRecoveryFactor(totalPnl: number, maxDrawdown: number): number {
    if (maxDrawdown === 0 || maxDrawdown < 0) return 0;
    return totalPnl / Math.abs(maxDrawdown);
  }

  private calculateProfitFactor(trades: any[]): number {
    if (!trades || trades.length === 0) return 0;

    let grossProfit = 0,
      grossLoss = 0;

    for (const trade of trades) {
      const pnl = parseFloat(trade.realizedPnl?.toString() || '0');
      if (pnl > 0) {
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }
    }

    return grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
  }
}
