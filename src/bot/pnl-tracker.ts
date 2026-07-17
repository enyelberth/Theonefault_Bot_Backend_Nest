import { OrderSide } from '@prisma/client';
import { StrategyPnlReporter } from './strategy-pnl-reporter';

interface Leg {
  entryPrice: number;
  quantity: number;
  openedAt: Date;
  side: OrderSide;
}

/**
 * Helper reusable para estrategias grid.
 * Cada strategy instancia un PnlTracker, abre "leg" cuando primera orden fills,
 * cierra "leg" cuando orden opuesta fills → dispara reportTrade automático.
 */
export class PnlTracker {
  private legs = new Map<number, Leg>();
  private profit = 0;
  private trades = 0;
  private wins = 0;
  private losses = 0;
  private reporter?: StrategyPnlReporter;

  attach(reporter: StrategyPnlReporter): void {
    this.reporter = reporter;
  }

  hasReporter(): boolean {
    return !!this.reporter;
  }

  openLeg(
    levelIdx: number,
    entryPrice: number,
    quantity: number,
    side: OrderSide = OrderSide.BUY,
    openedAt: Date = new Date(),
  ): void {
    this.legs.set(levelIdx, { entryPrice, quantity, openedAt, side });
  }

  hasLeg(levelIdx: number): boolean {
    return this.legs.has(levelIdx);
  }

  async closeLeg(
    levelIdx: number,
    exitPrice: number,
    externalOrderId?: string | number,
    fees = 0,
  ): Promise<number | null> {
    const leg = this.legs.get(levelIdx);
    if (!leg) return null;

    const direction = leg.side === OrderSide.BUY ? 1 : -1;
    const pnl = (exitPrice - leg.entryPrice) * leg.quantity * direction - fees;

    this.profit += pnl;
    this.trades += 1;
    if (pnl > 0) this.wins += 1;
    else this.losses += 1;

    await this.reporter?.reportTrade({
      externalOrderId: externalOrderId !== undefined ? String(externalOrderId) : undefined,
      side: leg.side,
      entryPrice: leg.entryPrice,
      exitPrice,
      quantity: leg.quantity,
      fees,
      openedAt: leg.openedAt,
      closedAt: new Date(),
    });

    this.legs.delete(levelIdx);
    return pnl;
  }

  computeUnrealized(lastPrice?: number): number {
    if (lastPrice === undefined || !Number.isFinite(lastPrice)) return 0;
    let unrealized = 0;
    for (const leg of this.legs.values()) {
      const direction = leg.side === OrderSide.BUY ? 1 : -1;
      unrealized += (lastPrice - leg.entryPrice) * leg.quantity * direction;
    }
    return unrealized;
  }

  computeUnrealizedBreakdown(lastPrice?: number): {
    net: number;
    profit: number;
    loss: number;
    legsInProfit: number;
    legsInLoss: number;
  } {
    const empty = { net: 0, profit: 0, loss: 0, legsInProfit: 0, legsInLoss: 0 };
    if (lastPrice === undefined || !Number.isFinite(lastPrice)) return empty;
    let profit = 0;
    let loss = 0;
    let legsInProfit = 0;
    let legsInLoss = 0;
    for (const leg of this.legs.values()) {
      const direction = leg.side === OrderSide.BUY ? 1 : -1;
      const legPnl = (lastPrice - leg.entryPrice) * leg.quantity * direction;
      if (legPnl > 0) {
        profit += legPnl;
        legsInProfit += 1;
      } else if (legPnl < 0) {
        loss += legPnl;
        legsInLoss += 1;
      }
    }
    return { net: profit + loss, profit, loss, legsInProfit, legsInLoss };
  }

  getInventory(): { qty: number; avgPrice: number; costBasis: number } {
    let qty = 0;
    let costBasis = 0;
    for (const leg of this.legs.values()) {
      const signedQty = leg.side === OrderSide.BUY ? leg.quantity : -leg.quantity;
      qty += signedQty;
      costBasis += leg.entryPrice * signedQty;
    }
    const avgPrice = qty !== 0 ? costBasis / qty : 0;
    return { qty, avgPrice, costBasis };
  }

  async snapshot(
    openPositions: number,
    lastPrice?: number,
    extra?: Record<string, any>,
  ): Promise<void> {
    const breakdown = this.computeUnrealizedBreakdown(lastPrice);
    const inv = this.getInventory();
    await this.reporter?.snapshotMetric({
      realizedPnl: this.profit,
      unrealizedPnl: breakdown.net,
      openPositions,
      tradesCount: this.trades,
      winCount: this.wins,
      lossCount: this.losses,
      lastPrice,
      extra: {
        ...(extra ?? {}),
        inventoryQty: inv.qty,
        inventoryAvgPrice: inv.avgPrice,
        inventoryCostBasis: inv.costBasis,
        totalPnl: this.profit + breakdown.net,
        unrealizedProfit: breakdown.profit,
        unrealizedLoss: breakdown.loss,
        openLegsInProfit: breakdown.legsInProfit,
        openLegsInLoss: breakdown.legsInLoss,
        realizedWins: this.wins,
        realizedLosses: this.losses,
      },
    });
  }

  getStats() {
    return {
      profit: this.profit,
      trades: this.trades,
      wins: this.wins,
      losses: this.losses,
      openLegs: this.legs.size,
    };
  }
}
