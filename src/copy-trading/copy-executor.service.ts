import { Injectable, Logger } from '@nestjs/common';
import { CopyMode, CopySubscription } from '@prisma/client';
import type { IExchange } from '../exchanges/exchange.interface';
import type { MarketType, Signal } from '../exchanges/domain';
import { ExchangeSelector } from '../bot-runner/exchange-selector.service';
import { BotRunnerRepository } from '../bot-runner/bot-runner.repository';
import { RiskManagerService } from '../risk/risk-manager.service';
import { buildRiskContext } from '../risk/risk-context-builder';
import { CopyTradingRepository } from './copy-trading.repository';

export interface DispatchInput {
  copyEventId: number;
  masterRunId: string;
  masterEquity: number;
  signal: Signal;
  subscription: CopySubscription;
}

export interface DispatchResult {
  status: 'FILLED' | 'REJECTED' | 'ERROR';
  reason?: string;
  orderId?: string;
  price?: number;
  quantity?: number;
  quoteQuantity?: number;
}

@Injectable()
export class CopyExecutorService {
  private readonly logger = new Logger(CopyExecutorService.name);

  constructor(
    private readonly selector: ExchangeSelector,
    private readonly repo: CopyTradingRepository,
    private readonly risk: RiskManagerService,
    private readonly botRunnerRepo: BotRunnerRepository,
  ) {}

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const { signal, subscription: sub, masterEquity, copyEventId } = input;
    let result: DispatchResult;
    try {
      const exchange = this.selector.resolve({
        mode: sub.exchangeMode as 'real' | 'paper',
        exchangeId: sub.exchangeId as any,
        paperAccountId: sub.paperAccountId ?? undefined,
      });

      if (signal.action === 'CANCEL_ALL') {
        try {
          await exchange.cancelAllOrders(signal.symbol);
          result = { status: 'FILLED', reason: 'CANCEL_ALL' };
        } catch (err: any) {
          // Si esto falla, el sistema cree que canceló y las órdenes del
          // follower pueden seguir vivas: hay que loguearlo fuerte y
          // reflejarlo como error, nunca tragarlo como si hubiera salido bien.
          const msg = err?.message ?? 'unknown error';
          this.logger.error(
            `CANCEL_ALL falló para sub=${sub.id} ${signal.symbol}: ${msg}`,
          );
          result = { status: 'ERROR', reason: `CANCEL_ALL failed: ${msg}` };
        }
      } else if (!signal.side || !signal.type) {
        result = { status: 'REJECTED', reason: 'signal missing side/type' };
      } else {
        const sized = await this.computeSize(
          exchange,
          signal,
          sub,
          masterEquity,
        );
        if (!sized) {
          result = {
            status: 'REJECTED',
            reason: 'sizing produced zero quantity',
          };
        } else {
          const gate = await this.gateWithRiskManager(
            exchange,
            signal,
            sub,
            sized,
          );
          if (!gate.allowed) {
            this.logger.warn(
              `dispatch sub=${sub.id} rejected by risk manager: ${gate.reason}`,
            );
            result = { status: 'REJECTED', reason: `risk: ${gate.reason}` };
          } else {
            const order = await exchange.placeOrder({
              symbol: signal.symbol,
              side: signal.side,
              type: signal.type,
              quantity: gate.quantity,
              quoteQuantity: gate.quoteQuantity,
              price: signal.price,
              stopPrice: signal.stopPrice,
              timeInForce: signal.timeInForce,
              market: signal.market,
              clientOrderId: `copy-${copyEventId}-${sub.id}`,
            });
            result = {
              status: 'FILLED',
              orderId: order.id,
              price: order.averagePrice || order.price,
              quantity: order.filledQuantity || order.quantity,
              quoteQuantity: order.quoteQuantity,
            };
          }
        }
      }
    } catch (e) {
      const msg = (e as Error).message;
      this.logger.warn(`dispatch sub=${sub.id}: ${msg}`);
      result = { status: 'ERROR', reason: msg };
    }

    await this.repo
      .recordExecution({
        copyEventId,
        subscriptionId: sub.id,
        status: result.status,
        reason: result.reason,
        orderId: result.orderId,
        price: result.price,
        quantity: result.quantity,
        quoteQuantity: result.quoteQuantity,
      })
      .catch((e) =>
        this.logger.warn(`recordExecution: ${(e as Error).message}`),
      );

    return result;
  }

  private async computeSize(
    exchange: IExchange,
    signal: Signal,
    sub: CopySubscription,
    masterEquity: number,
  ): Promise<{ quantity?: number; quoteQuantity?: number } | null> {
    const mult = sub.sizeMultiplier ?? 1;
    let quantity = signal.quantity;
    let quoteQuantity = signal.quoteQuantity;

    if (sub.mode === CopyMode.FIXED_QUOTE) {
      if (!sub.fixedQuote || sub.fixedQuote <= 0) return null;
      quantity = undefined;
      quoteQuantity = sub.fixedQuote;
    } else if (sub.mode === CopyMode.PROPORTIONAL) {
      const followerEquity = await this.readEquity(exchange);
      if (masterEquity <= 0 || followerEquity <= 0) return null;
      const ratio = (followerEquity / masterEquity) * mult;
      if (quantity !== undefined) quantity = quantity * ratio;
      if (quoteQuantity !== undefined) quoteQuantity = quoteQuantity * ratio;
    } else {
      if (quantity !== undefined) quantity = quantity * mult;
      if (quoteQuantity !== undefined) quoteQuantity = quoteQuantity * mult;
    }

    if (sub.maxRiskPct && sub.maxRiskPct > 0) {
      const followerEquity = await this.readEquity(exchange);
      const cap = followerEquity * (sub.maxRiskPct / 100);
      if (quoteQuantity !== undefined && quoteQuantity > cap)
        quoteQuantity = cap;
      if (
        quantity !== undefined &&
        signal.price &&
        quantity * signal.price > cap
      ) {
        quantity = cap / signal.price;
      }
    }

    const q = quantity ?? 0;
    const qq = quoteQuantity ?? 0;
    if (q <= 0 && qq <= 0) return null;
    return { quantity, quoteQuantity };
  }

  /**
   * Autoridad final antes de tocar el exchange. Reusa el mismo RiskManagerService
   * que bot-runner, scopeando el kill switch al followerRunId (la subscripción de
   * copy-trading corre sobre un BotRunner run, mismo scope 'BOT'). El follower
   * tiene su propio BotRunnerRun con su propio riskProfile: se reusan sus límites
   * de drawdown/dailyLoss/openPositions en vez de dejarlos sin tope.
   */
  private async gateWithRiskManager(
    exchange: IExchange,
    signal: Signal,
    sub: CopySubscription,
    sized: { quantity?: number; quoteQuantity?: number },
  ): Promise<{
    allowed: boolean;
    reason?: string;
    quantity?: number;
    quoteQuantity?: number;
  }> {
    const killed = await this.risk.isKilled('BOT', sub.followerRunId);
    if (killed) {
      return { allowed: false, reason: 'kill switch active (BOT)' };
    }

    // El follower es en sí un BotRunnerRun (su propio riskProfile, su propio
    // peakEquity/dailyPnl persistidos). Antes esto se ignoraba por completo
    // y se armaba un contexto con drawdown/dailyLoss/openPositions en 100
    // (= sin tope real): un follower podía acumular posiciones sin límite
    // mientras el master siguiera emitiendo señales. Ahora se reusa el
    // mismo perfil y los mismos cálculos que bot-runner usa para sí mismo.
    const followerRun = await this.botRunnerRepo
      .byRunId(sub.followerRunId)
      .catch(() => null);
    if (!followerRun) {
      return { allowed: false, reason: 'follower run not found' };
    }
    const riskProfile = followerRun.riskProfileId
      ? await this.risk.loadProfile(followerRun.riskProfileId).catch(() => null)
      : null;

    const equity = await this.readEquity(exchange);
    const freeMargin = await this.readFreeMargin(exchange);
    const peakEquity = Math.max(Number(followerRun.peakEquity ?? 0), equity);
    const currentDrawdownPct =
      peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    const dailyPnl = await this.botRunnerRepo
      .computeDailyPnl(followerRun.id)
      .catch(() => 0);
    const openPositionsCount = await this.countPositions(exchange);

    const context = buildRiskContext({
      accountEquity: equity,
      freeMargin,
      dailyPnl,
      currentDrawdownPct,
      openPositionsCount,
      maxPositionSizePct:
        sub.maxRiskPct && sub.maxRiskPct > 0
          ? sub.maxRiskPct
          : (riskProfile?.maxPositionSizePct ?? 100),
      maxDrawdownPct: riskProfile?.maxDrawdownPct ?? 100,
      maxDailyLossPct: riskProfile?.maxDailyLossPct ?? 100,
      maxOpenPositions: riskProfile?.maxOpenPositions ?? 100,
      killSwitchEnabled: false,
    });

    const sizedSignal: Signal = {
      ...signal,
      quantity: sized.quantity,
      quoteQuantity: sized.quoteQuantity,
    };

    const result = await this.risk.check({ signal: sizedSignal, context });
    if (!result.decision.allowed) {
      return {
        allowed: false,
        reason: `${result.decision.code}: ${result.decision.reason}`,
      };
    }

    const adjusted = result.adjustedSignal ?? sizedSignal;
    return {
      allowed: true,
      quantity: adjusted.quantity,
      quoteQuantity: adjusted.quoteQuantity,
    };
  }

  private async readEquity(exchange: IExchange): Promise<number> {
    const balance = await exchange.getBalance('SPOT').catch(() => null);
    if (!balance) return 0;
    if (balance.totalValueUsd !== undefined) return balance.totalValueUsd;
    return balance.balances.reduce((a, b) => a + b.total, 0);
  }

  private async readFreeMargin(exchange: IExchange): Promise<number> {
    const balance = await exchange.getBalance('SPOT').catch(() => null);
    if (!balance) return 0;
    return balance.balances.reduce((a, b) => a + b.free, 0);
  }

  private async countPositions(exchange: IExchange): Promise<number> {
    const positions = await exchange
      .getPositions('SPOT' as MarketType)
      .catch(() => [] as Awaited<ReturnType<IExchange['getPositions']>>);
    return positions.filter((p) => p.quantity > 0 && p.side !== 'FLAT').length;
  }
}
