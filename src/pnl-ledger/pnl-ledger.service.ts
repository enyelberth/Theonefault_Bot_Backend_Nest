import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface OpenLot {
  strategyId: string;
  symbol: string;
  entryOrderId: number;
  remainingQty: Decimal;
  avgEntryPrice: Decimal;
}

export interface MatchedLot {
  entryOrderId: number;
  matchedQty: Decimal;
  avgEntryPrice: Decimal;
  realizedPnl: Decimal;
}

@Injectable()
export class PnlLedgerService implements OnModuleInit {
  private readonly logger = new Logger(PnlLedgerService.name);
  private lotBook = new Map<string, OpenLot[]>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedLotBookFromDb();
  }

  async seedLotBookFromDb() {
    try {
      const openLots = await (this.prisma as any).openLotPosition?.findMany?.() || [];
      this.lotBook.clear();

      for (const lot of openLots) {
        const key = `${lot.strategyId}:${lot.symbol}`;
        if (!this.lotBook.has(key)) {
          this.lotBook.set(key, []);
        }
        const lotsArray = this.lotBook.get(key);
        if (lotsArray) {
          lotsArray.push({
            strategyId: lot.strategyId,
            symbol: lot.symbol,
            entryOrderId: lot.entryOrderId,
            remainingQty: lot.remainingQty,
            avgEntryPrice: lot.avgEntryPrice,
          });
        }
      }
      this.logger.log(`Seeded ${openLots.length} open lots from DB`);
    } catch (error) {
      this.logger.error(`Error seeding lot book: ${error.message}`, error.stack);
    }
  }

  async recordOpenLot(
    strategyId: string,
    symbol: string,
    entryOrderId: number,
    quantity: Decimal,
    price: Decimal,
  ) {
    const key = `${strategyId}:${symbol}`;
    if (!this.lotBook.has(key)) {
      this.lotBook.set(key, []);
    }

    const lot: OpenLot = {
      strategyId,
      symbol,
      entryOrderId,
      remainingQty: new Decimal(quantity),
      avgEntryPrice: new Decimal(price),
    };

    const lotsArray = this.lotBook.get(key);
    if (lotsArray) {
      lotsArray.push(lot);
    }

    try {
      await (this.prisma as any).openLotPosition?.upsert?.({
        where: { entryOrderId },
        create: lot,
        update: lot,
      });
    } catch (error) {
      this.logger.warn(`Could not persist open lot: ${(error as Error).message}`);
    }
  }

  async matchAndCloseLot(
    strategyId: string,
    symbol: string,
    exitOrderId: number,
    exitPrice: Decimal,
    sellQty: Decimal,
    commissionEst: Decimal = new Decimal(0),
  ): Promise<{ realizedPnl: Decimal; matchedLots: MatchedLot[] }> {
    const key = `${strategyId}:${symbol}`;
    const lots = this.lotBook.get(key) || [];
    let remainingSellQty = new Decimal(sellQty);
    let totalRealizedPnl = new Decimal(0);
    const matchedLots: MatchedLot[] = [];

    for (let i = 0; i < lots.length && remainingSellQty.gt(0); i++) {
      const lot = lots[i];
      const matchedQty = remainingSellQty.lte(lot.remainingQty)
        ? remainingSellQty
        : lot.remainingQty;

      const lotRealizedPnl = matchedQty.mul(
        new Decimal(exitPrice).minus(lot.avgEntryPrice),
      );
      totalRealizedPnl = totalRealizedPnl.plus(lotRealizedPnl);

      matchedLots.push({
        entryOrderId: lot.entryOrderId,
        matchedQty,
        avgEntryPrice: lot.avgEntryPrice,
        realizedPnl: lotRealizedPnl,
      });

      lot.remainingQty = lot.remainingQty.minus(matchedQty);
      remainingSellQty = remainingSellQty.minus(matchedQty);

      if (lot.remainingQty.eq(0)) {
        try {
          await (this.prisma as any).openLotPosition?.deleteMany?.({
            where: { entryOrderId: lot.entryOrderId },
          });
        } catch (error) {
          this.logger.warn(`Could not delete lot: ${(error as Error).message}`);
        }
        lots.splice(i, 1);
        i--;
      } else {
        try {
          await (this.prisma as any).openLotPosition?.update?.({
            where: { entryOrderId: lot.entryOrderId },
            data: { remainingQty: lot.remainingQty },
          });
        } catch (error) {
          this.logger.warn(`Could not update lot: ${(error as Error).message}`);
        }
      }
    }

    if (lots.length === 0) {
      this.lotBook.delete(key);
    }

    const netPnl = totalRealizedPnl.minus(commissionEst);

    if (matchedLots.length > 0) {
      const firstMatchedLot = matchedLots[0];
      try {
        await (this.prisma as any).tradePnlRecord?.create?.({
          data: {
            strategyId,
            symbol,
            entryOrderId: firstMatchedLot.entryOrderId,
            exitOrderId,
            entryAvgPrice: firstMatchedLot.avgEntryPrice,
            exitAvgPrice: new Decimal(exitPrice),
            quantity: sellQty,
            realizedPnl: totalRealizedPnl,
            commissionEst,
            netPnl,
            closedAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.warn(`Could not create trade PnL record: ${(error as Error).message}`);
      }
    }

    return {
      realizedPnl: totalRealizedPnl,
      matchedLots,
    };
  }

  async persistStrategyStats(
    strategyId: string,
    stats: {
      totalOrders: number;
      filledOrders: number;
      cancelledOrders: number;
      realizedPnl: Decimal;
      winningTrades: number;
      losingTrades: number;
      winRate: Decimal;
    },
  ) {
    const winRate = stats.losingTrades + stats.winningTrades > 0
      ? new Decimal(stats.winningTrades).div(
          stats.losingTrades + stats.winningTrades,
        )
      : new Decimal(0);

    try {
      await (this.prisma as any).strategyStatSnapshot?.upsert?.({
        where: { strategyId },
        create: {
          strategyId,
          ...stats,
          winRate,
        },
        update: {
          ...stats,
          winRate,
        },
      });
    } catch (error) {
      this.logger.warn(`Could not persist strategy stats: ${(error as Error).message}`);
    }
  }

  async getStrategyStats(strategyId: string) {
    try {
      return await (this.prisma as any).strategyStatSnapshot?.findUnique?.({
        where: { strategyId },
      });
    } catch (error) {
      this.logger.warn(`Could not get strategy stats: ${(error as Error).message}`);
      return null;
    }
  }

  async getAllTradeHistory(filters?: {
    strategyId?: string;
    symbol?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  }) {
    const where: any = {};

    if (filters?.strategyId) where.strategyId = filters.strategyId;
    if (filters?.symbol) where.symbol = filters.symbol;
    if (filters?.startDate || filters?.endDate) {
      where.closedAt = {};
      if (filters?.startDate)
        where.closedAt.gte = filters.startDate;
      if (filters?.endDate) where.closedAt.lte = filters.endDate;
    }

    try {
      return await (this.prisma as any).tradePnlRecord?.findMany?.({
        where,
        orderBy: { closedAt: 'desc' },
        skip: filters?.skip || 0,
        take: filters?.limit || 100,
      }) || [];
    } catch (error) {
      this.logger.warn(`Could not get trade history: ${(error as Error).message}`);
      return [];
    }
  }

  async getTradeSummary(filters?: {
    strategyId?: string;
    symbol?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const trades = await this.getAllTradeHistory(filters);

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: new Decimal(0),
        totalNetPnl: new Decimal(0),
        avgPnl: new Decimal(0),
        maxPnl: new Decimal(0),
        minPnl: new Decimal(0),
      };
    }

    let totalPnl = new Decimal(0);
    let totalNetPnl = new Decimal(0);
    let maxPnl = new Decimal(trades[0]?.realizedPnl || 0);
    let minPnl = new Decimal(trades[0]?.realizedPnl || 0);
    let winningCount = 0;

    for (const trade of trades) {
      totalPnl = totalPnl.plus(trade.realizedPnl);
      totalNetPnl = totalNetPnl.plus(trade.netPnl);

      if (trade.realizedPnl.gt(0)) winningCount++;
      maxPnl = Decimal.max(maxPnl, trade.realizedPnl);
      minPnl = Decimal.min(minPnl, trade.realizedPnl);
    }

    const winRate = new Decimal(winningCount).div(trades.length);

    return {
      totalTrades: trades.length,
      winningTrades: winningCount,
      losingTrades: trades.length - winningCount,
      winRate: winRate.toNumber(),
      totalPnl,
      totalNetPnl,
      avgPnl: totalPnl.div(trades.length),
      maxPnl,
      minPnl,
    };
  }
}
