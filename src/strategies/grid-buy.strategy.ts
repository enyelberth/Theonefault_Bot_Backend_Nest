import { Injectable, Logger } from '@nestjs/common';
import { OrderSide, PrismaClient } from '@prisma/client';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';
import { PnlTracker } from '../bot/pnl-tracker';
import { StrategyPnlReporter } from '../bot/strategy-pnl-reporter';

interface Order {
  orderId: number;
  price: string;
  origQty: string;
  timestamp: number;
  isSell?: boolean;
}

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  fgGreen: '\x1b[32m',
  fgYellow: '\x1b[33m',
  fgRed: '\x1b[31m',
  fgCyan: '\x1b[36m',
  fgMagenta: '\x1b[35m',
};

@Injectable()
export class GridBuyStrategy implements TradingStrategy {
  id: string;
  symbol: string;
  config: {
    gridCount: number;
    lowerPrice: number;
    upperPrice: number;
    totalQuantity: number;
    profitMargin: number;
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number; // Porcentaje (ej. 0.001 = 0.1%)
    gridStepPrice?: number; // Fuerza spacing entre niveles (USDT). Sobrescribe derivado de gridCount.
    minOrderNotional?: number; // Notional mínimo por orden (USDT). Sube qty si es menor.
    uniformQuantity?: boolean; // Si true, no aplica distanceFactor; qty igual en todos niveles.
    postOnly?: boolean; // Default true: usa LIMIT_MAKER para pagar fee maker (-25% con BNB burn = 0.5625bps)
    autoAdjustRange?: boolean; // Si true, recentra [lowerPrice, upperPrice] automáticamente cuando el precio se acerca a un borde.
    rangeEdgeBufferPct?: number; // Fracción del ancho total que dispara el recentrado al acercarse a un borde. Default 0.1 (10%).
    rangeAdjustCooldownMs?: number; // Mínimo tiempo entre recentrados, evita thrashing. Default 5 min.
  };

  private readonly logger = new Logger(GridBuyStrategy.name);
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private openStopLossOrders = new Map<number, Order>();
  private isRunning = true;
  private skippedLevels = new Set<number>(); // niveles omitidos porque precio < nivel

  private profitLoss = 0; // Variable para acumulación de ganancia/pérdida
  private pnl = new PnlTracker();
  private botRunId?: number;
  private prismaCtx?: PrismaClient;
  private hydrated = false;

  // Contadores runtime para dashboard
  private filledBuyCount = 0;
  private filledSellCount = 0;
  private canceledCount = 0;
  private manualLevels = new Map<number, Order>(); // niveles agregados vía addOrderLevel
  private sleepTicks = 0;
  private lastSleepLogAt = 0;
  private lastRangeAdjustAt = 0;
  private rangeAdjustCount = 0;

  constructor(private readonly binanceService: BinanceService) {}

  attachPnlReporter(reporter: StrategyPnlReporter): void {
    this.pnl.attach(reporter);
  }

  setBotRunContext(botRunId: number, prisma: PrismaClient): void {
    this.botRunId = botRunId;
    this.prismaCtx = prisma;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  async run() {
    this.logInfo(
      `Starting Grid Buy on ${this.symbol} with config: ${JSON.stringify(this.config)}`,
    );

    const { priceFilter, lotSizeFilter } =
      await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter)
      throw new Error(`Filters not found for ${this.symbol}`);

    if (
      this.config.lowerPrice === undefined ||
      this.config.upperPrice === undefined
    ) {
      throw new Error(
        'Debe definir lowerPrice y upperPrice en la configuración para usar grillas fijas.',
      );
    }

    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;

    // Si gridStepPrice está definido, deriva gridCount desde el spacing solicitado.
    if (this.config.gridStepPrice && this.config.gridStepPrice > 0) {
      const derivedCount = Math.max(
        1,
        Math.round((upperPrice - lowerPrice) / this.config.gridStepPrice),
      );
      if (derivedCount !== this.config.gridCount) {
        this.logInfo(
          `gridStepPrice=${this.config.gridStepPrice} → gridCount recalculado ${this.config.gridCount} → ${derivedCount}`,
        );
        this.config.gridCount = derivedCount;
      }
    }

    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;
    this.logInfo(
      `Grid: rango [${lowerPrice}, ${upperPrice}] step=${gridStep.toFixed(6)} niveles=${this.config.gridCount + 1} minNotional=${this.config.minOrderNotional ?? 'off'}`,
    );

    await this.hydrateFromDb(lowerPrice, gridStep);

    if (!this.hydrated) {
      await this.cancelExistingOrdersInRange(lowerPrice, upperPrice);
      await this.placeBuyOrders(
        lowerPrice,
        gridStep,
        priceFilter,
        lotSizeFilter,
        await this.getCurrentPrice(),
      );
    } else {
      this.logInfo(
        `[HYDRATE] skip initial place/cancel — restored state from DB`,
      );
    }

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        await this.maybeAutoAdjustRange(currentPrice, priceFilter, lotSizeFilter);

        await this.tryPlaceSkippedLevels(
          currentPrice,
          priceFilter,
          lotSizeFilter,
        );

        await this.checkBuyOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkStopLossOrders();

        await this.pnl.snapshot(this.openSellOrders.size, currentPrice, {
          openBuys: this.openBuyOrders.size,
          skipped: this.skippedLevels.size,
        });

        const sleepDuration = this.calculateSleepDuration();
        this.sleepTicks++;
        const now = Date.now();
        if (now - this.lastSleepLogAt > 30_000) {
          this.lastSleepLogAt = now;
          const secs = (sleepDuration / 1000).toFixed(1);
          const openB = this.openBuyOrders.size;
          const openS = this.openSellOrders.size;
          this.logInfo(
            `${this.symbol} idle ${secs}s  buys=${openB} sells=${openS} filled=${this.filledBuyCount}/${this.filledSellCount} pnl=${this.profitLoss.toFixed(4)}`,
          );
        }
        await this.sleep(sleepDuration);
      } catch (err) {
        this.logError(`Error in monitoring loop: ${this.describeError(err)}`);
        await this.exponentialBackoff(30000, 5);
      }
    }
  }

  private async getCurrentPrice(): Promise<number> {
    const resp = await this.binanceService.getSymbolPrice(this.symbol);
    return parseFloat(resp.price);
  }

  private priceToLevel(
    price: number,
    lowerPrice: number,
    gridStep: number,
  ): number {
    if (gridStep <= 0) return -1;
    return Math.round((price - lowerPrice) / gridStep);
  }

  private async hydrateFromDb(
    lowerPrice: number,
    gridStep: number,
  ): Promise<void> {
    if (!this.botRunId || !this.prismaCtx) return;
    try {
      const orders = await this.prismaCtx.paperOrder.findMany({
        where: { botRunId: this.botRunId, symbol: this.symbol },
        orderBy: { createdAt: 'asc' },
      });
      if (!orders.length) return;

      const fillsBuyByLevel = new Map<
        number,
        { qty: number; price: number; openedAt: Date }
      >();
      const filledSellLevels = new Set<number>();
      const filledStopLossLevels = new Set<number>();

      for (const o of orders) {
        const referencePrice = Number(o.price ?? o.filledPrice ?? 0);
        if (!Number.isFinite(referencePrice) || referencePrice <= 0) continue;
        const level = this.priceToLevel(referencePrice, lowerPrice, gridStep);
        if (level < 0 || level > this.config.gridCount) continue;

        if (o.status === 'OPEN') {
          const orderObj: Order = {
            orderId: Number(o.externalId ?? o.id),
            price: String(referencePrice),
            origQty: String(o.quantity),
            timestamp: (o.createdAt ?? new Date()).getTime(),
          };
          if (o.type === 'LIMIT' && o.side === OrderSide.BUY) {
            this.openBuyOrders.set(level, orderObj);
          } else if (o.type === 'LIMIT' && o.side === OrderSide.SELL) {
            this.openSellOrders.set(level, { ...orderObj, isSell: true });
          } else if (o.type === 'STOP_LOSS' || o.type === 'STOP_LOSS_LIMIT') {
            this.openStopLossOrders.set(level, orderObj);
          }
        } else if (o.status === 'FILLED') {
          const filledAt = o.filledAt ?? o.createdAt ?? new Date();
          const fillPrice = Number(o.filledPrice ?? o.price ?? 0);
          const qty = Number(o.quantity);
          if (o.side === OrderSide.BUY && o.type === 'LIMIT') {
            fillsBuyByLevel.set(level, {
              qty,
              price: fillPrice,
              openedAt: filledAt,
            });
          } else if (o.side === OrderSide.SELL && o.type === 'LIMIT') {
            filledSellLevels.add(level);
          } else if (o.type === 'STOP_LOSS' || o.type === 'STOP_LOSS_LIMIT') {
            filledStopLossLevels.add(level);
          }
        }
      }

      let restoredLegs = 0;
      for (const [level, buy] of fillsBuyByLevel.entries()) {
        if (filledSellLevels.has(level)) continue;
        if (filledStopLossLevels.has(level)) continue;
        this.pnl.openLeg(
          level,
          buy.price,
          buy.qty,
          OrderSide.BUY,
          buy.openedAt,
        );
        restoredLegs += 1;
      }

      this.hydrated = true;
      this.logInfo(
        `[HYDRATE] botRun=${this.botRunId} legs=${restoredLegs} openBuys=${this.openBuyOrders.size} openSells=${this.openSellOrders.size} openSL=${this.openStopLossOrders.size}`,
      );
    } catch (err) {
      this.logError(`[HYDRATE] failed: ${this.describeError(err)}`);
    }
  }

  private async cancelExistingOrdersInRange(
    lowerPrice: number,
    upperPrice: number,
  ) {
    try {
      const allOrders = await this.binanceService.getAllOrders(
        this.symbol,
        500,
      );
      for (const o of allOrders) {
        const status = o.status;
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(status))
          continue;
        const p = Number(o.price);
        if (!Number.isFinite(p)) continue;
        if (p >= lowerPrice && p <= upperPrice) {
          try {
            await this.binanceService.cancelOrder(this.symbol, o.orderId);
            this.logWarn(
              `ALERTA: Orden abierta cancelada ID ${o.orderId} precio ${o.price} dentro del rango [${lowerPrice}, ${upperPrice}]`,
            );
          } catch (err) {
            this.logError(`Error al cancelar orden ID ${o.orderId}: ${this.describeError(err)}`);
          }
        }
      }
    } catch (err) {
      this.logError(`Error obteniendo/cancelando órdenes existentes: ${this.describeError(err)}`);
    }
  }

  /**
   * Recentra [lowerPrice, upperPrice] cuando el precio se acerca a un borde,
   * manteniendo el mismo ancho total. Solo cancela BUY sin llenar que quedaron
   * fuera del rango nuevo — nunca toca posiciones ya abiertas (openSellOrders/
   * openStopLossOrders), esas siguen su ciclo de vida normal sin importar dónde
   * esté la caja ahora.
   */
  private async maybeAutoAdjustRange(
    currentPrice: number,
    priceFilter: any,
    lotSizeFilter: any,
  ): Promise<void> {
    if (!this.config.autoAdjustRange) return;

    const width = this.config.upperPrice - this.config.lowerPrice;
    if (width <= 0) return;

    const cooldownMs = this.config.rangeAdjustCooldownMs ?? 300_000;
    const now = Date.now();
    if (now - this.lastRangeAdjustAt < cooldownMs) return;

    const bufferPct = this.config.rangeEdgeBufferPct ?? 0.1;
    const buffer = width * bufferPct;
    const nearTop = currentPrice >= this.config.upperPrice - buffer;
    const nearBottom = currentPrice <= this.config.lowerPrice + buffer;
    if (!nearTop && !nearBottom) return;

    let newLower: number;
    let newUpper: number;
    if (nearTop) {
      newUpper = this.roundToStep(currentPrice + buffer, priceFilter.tickSize);
      newLower = this.roundToStep(newUpper - width, priceFilter.tickSize);
    } else {
      newLower = this.roundToStep(currentPrice - buffer, priceFilter.tickSize);
      newUpper = this.roundToStep(newLower + width, priceFilter.tickSize);
    }

    this.rangeAdjustCount++;
    await this.applyNewRange(
      newLower,
      newUpper,
      undefined,
      priceFilter,
      lotSizeFilter,
      currentPrice,
      `auto #${this.rangeAdjustCount}`,
    );
    this.lastRangeAdjustAt = now;
  }

  /**
   * Núcleo compartido entre el auto-ajuste y el resize manual (`resizeGrid`):
   * cambia [lowerPrice, upperPrice] (y opcionalmente gridCount), cancela SOLO
   * las BUY sin llenar que quedaron fuera de la caja nueva, y coloca niveles
   * frescos en el rango actualizado. Nunca toca openSellOrders ni
   * openStopLossOrders — una posición ya abierta sigue su ciclo hasta que
   * su propio take-profit o stop-loss la cierre, sin importar cómo cambie
   * la caja de ahí en adelante.
   */
  private async applyNewRange(
    newLower: number,
    newUpper: number,
    newGridCount: number | undefined,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
    reason: string,
  ): Promise<{ canceled: number; placedBefore: number }> {
    const oldLower = this.config.lowerPrice;
    const oldUpper = this.config.upperPrice;
    const oldGridCount = this.config.gridCount;

    this.config.lowerPrice = newLower;
    this.config.upperPrice = newUpper;
    if (newGridCount !== undefined && newGridCount >= 2) {
      this.config.gridCount = newGridCount;
    }

    this.logWarn(
      `Rango ajustado (${reason}): [${oldLower}, ${oldUpper}] gridCount=${oldGridCount} -> [${newLower}, ${newUpper}] gridCount=${this.config.gridCount} (precio actual ${currentPrice})`,
    );

    let canceled = 0;
    for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
      const p = parseFloat(order.price);
      if (p < newLower || p > newUpper) {
        try {
          await this.binanceService.cancelOrder(this.symbol, order.orderId);
          canceled++;
        } catch (e) {
          this.logError(
            `Error cancelando orden fuera de rango nivel ${i}: ${this.describeError(e)}`,
          );
        }
        this.openBuyOrders.delete(i);
      }
    }
    this.skippedLevels.clear();

    const placedBefore = this.openBuyOrders.size;
    const newGridStep = (newUpper - newLower) / this.config.gridCount;
    await this.placeBuyOrders(
      newLower,
      newGridStep,
      priceFilter,
      lotSizeFilter,
      currentPrice,
    );
    return { canceled, placedBefore };
  }

  /**
   * Resize manual del grid vía API (botService.resizeGrid), independiente
   * del loop interno. Cualquier BUY ya llenado (con su SELL/stop-loss
   * pendiente) sigue abierto esperando su propio cierre, sin que importe
   * si su nivel original quedó fuera de la caja nueva.
   */
  public async resizeGrid(input: {
    lowerPrice: number;
    upperPrice: number;
    gridCount?: number;
  }): Promise<{ ok: boolean; canceled: number; placed: number }> {
    if (input.upperPrice <= input.lowerPrice) {
      throw new Error('resizeGrid: upperPrice debe ser mayor que lowerPrice');
    }
    const { priceFilter, lotSizeFilter } =
      await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    const currentPrice = await this.getCurrentPrice();

    const { canceled } = await this.applyNewRange(
      input.lowerPrice,
      input.upperPrice,
      input.gridCount,
      priceFilter,
      lotSizeFilter,
      currentPrice,
      'manual',
    );

    return { ok: true, canceled, placed: this.openBuyOrders.size };
  }

  private async placeBuyOrders(
    lowerPrice: number,
    gridStep: number,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const totalQty = this.config.totalQuantity;
    const safety = this.config.buySafetyMargin ?? 0.0005;
    const safeThreshold = currentPrice * (1 - safety);
    let qtySum = 0;

    for (let i = 0; i <= this.config.gridCount; i++) {
      if (this.openBuyOrders.has(i)) continue;

      const buyPriceRaw = lowerPrice + i * gridStep;
      const buyPriceNum = this.roundToStep(buyPriceRaw, priceFilter.tickSize);

      if (buyPriceNum >= safeThreshold || buyPriceNum >= currentPrice) {
        this.logWarn(
          `ALERTA: Nivel ${i} (${buyPriceNum}) >= umbral seguro ${safeThreshold.toFixed(8)} o >= precio actual ${currentPrice} -> se omite colocación`,
        );
        this.skippedLevels.add(i);
        continue;
      } else {
        if (this.skippedLevels.has(i)) this.skippedLevels.delete(i);
      }

      const distanceFactor =
        1 -
        Math.abs(buyPriceRaw - currentPrice) /
          (gridStep * this.config.gridCount);
      let quantity: number;
      if (this.config.uniformQuantity) {
        quantity = totalQty / this.config.gridCount;
      } else {
        quantity =
          (totalQty / this.config.gridCount) * (0.5 + distanceFactor / 2);
      }
      if (totalQty > 0) {
        quantity = Math.min(quantity, Math.max(0, totalQty - qtySum));
      }
      const adjQuantity = this.enforceMinNotional(
        quantity,
        buyPriceNum,
        lotSizeFilter,
      );
      qtySum += adjQuantity;

      const notional = adjQuantity * buyPriceNum;
      if (adjQuantity <= 0) {
        this.logWarn(`Nivel ${i} qty=0 tras redondeo -> omitido`);
        continue;
      }

      // Garantizar que placePrice no supere safeThreshold y sea múltiplo de tickSize
      let placePriceNum = Math.min(
        buyPriceNum,
        safeThreshold - parseFloat(priceFilter.tickSize),
      );
      placePriceNum = this.roundToStep(placePriceNum, priceFilter.tickSize);

      this.logInfo(
        `Placing LIMIT BUY level ${i} price=${placePriceNum} qty=${adjQuantity} notional=${notional.toFixed(4)}`,
      );

      try {
        const order = await this.placeLimit(
          'BUY',
          adjQuantity.toString(),
          placePriceNum.toString(),
          priceFilter.tickSize,
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price ?? placePriceNum),
          origQty: String(order.origQty ?? adjQuantity),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logSuccess(
          `BUY order created ID: ${normalizedOrder.orderId} at level ${i} price ${placePriceNum}`,
        );
      } catch (error: any) {
        const bmsg =
          error?.response?.data?.msg ?? error?.message ?? String(error);
        const bcode = error?.response?.data?.code;
        this.logError(
          `Error BUY level ${i} price=${placePriceNum} qty=${adjQuantity} notional=${notional.toFixed(4)} → Binance code=${bcode} msg=${bmsg}`,
        );
      }

      await this.sleep(250);
    }
  }

  private async tryPlaceSkippedLevels(
    currentPrice: number,
    priceFilter: any,
    lotSizeFilter: any,
  ) {
    if (this.skippedLevels.size === 0) return;
    const safety = this.config.buySafetyMargin ?? 0.0008;
    const safeThreshold = currentPrice * (1 - safety);
    const levels = Array.from(this.skippedLevels).sort((a, b) => a - b);
    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      if (this.openBuyOrders.has(i)) {
        this.skippedLevels.delete(i);
        continue;
      }
      const buyPriceRaw = lowerPrice + i * gridStep;
      const buyPriceNum = this.roundToStep(buyPriceRaw, priceFilter.tickSize);

      if (buyPriceNum < safeThreshold && buyPriceNum < currentPrice) {
        let placePriceNum = Math.min(
          buyPriceNum,
          safeThreshold - parseFloat(priceFilter.tickSize),
        );
        placePriceNum = this.roundToStep(placePriceNum, priceFilter.tickSize);
        this.logInfo(
          `ALERTA: Precio subió a ${currentPrice} — intentando colocar nivel ${i} a ${placePriceNum} (nivel raw ${buyPriceRaw.toFixed(8)})`,
        );
        try {
          const rawQty =
            this.config.uniformQuantity || !this.config.totalQuantity
              ? (this.config.totalQuantity || 0) / this.config.gridCount
              : this.config.totalQuantity / this.config.gridCount;
          const quantity = this.enforceMinNotional(
            rawQty,
            placePriceNum,
            lotSizeFilter,
          );
          const order = await this.placeLimit(
            'BUY',
            quantity.toString(),
            placePriceNum.toString(),
            priceFilter.tickSize,
          );
          const normalizedOrder: Order = {
            orderId: Number(order.orderId),
            price: String(order.price ?? placePriceNum),
            origQty: String(order.origQty ?? quantity),
            timestamp: Date.now(),
          };
          this.openBuyOrders.set(i, normalizedOrder);
          this.skippedLevels.delete(i);
          this.logSuccess(
            `BUY order (skipped->placed) created ID: ${normalizedOrder.orderId} at level ${i} price ${placePriceNum}`,
          );
        } catch (err: any) {
          const bmsg = err?.response?.data?.msg ?? err?.message ?? String(err);
          const bcode = err?.response?.data?.code;
          this.logError(
            `Error BUY (skipped) level ${i} → Binance code=${bcode} msg=${bmsg}`,
          );
        }
        await this.sleep(250);
      } else {
        this.logInfo(
          `Nivel ${i} sigue omitido: nivel ${buyPriceNum} >= umbral seguro ${safeThreshold.toFixed(8)} o >= precio actual ${currentPrice}`,
        );
      }
    }
  }

  private async checkBuyOrders(
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const stopLossMargin = this.config.stopLossMargin ?? 0.02;

    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkOrderStatus(
          this.symbol,
          order.orderId,
        );

        if (statusData.status === 'FILLED') {
          this.filledBuyCount++;
          this.logSuccess(
            `Order BUY level ${i} completed ID: ${order.orderId}`,
          );
          this.openBuyOrders.delete(i);

          const buyPrice = parseFloat(order.price);
          const quantityRaw = parseFloat(order.origQty);
          const sellPriceRaw = buyPrice * (1 + this.config.profitMargin);
          const sellPrice = this.roundToStep(
            sellPriceRaw,
            priceFilter.tickSize,
          );

          // Actualizar ganancia/pérdida estimada
          const estimatedProfit = (sellPriceRaw - buyPrice) * quantityRaw;
          this.profitLoss += estimatedProfit;
          this.logInfo(
            `Ganancia/Pérdida estimada actualizada: ${this.profitLoss.toFixed(8)}`,
          );

          // Registrar apertura de leg BUY para tracking de PnL real
          this.pnl.openLeg(i, buyPrice, quantityRaw, OrderSide.BUY);

          // Intentar crear orden de venta con manejo robusto
          try {
            const sellOrder = await this.placeLimit(
              'SELL',
              quantityRaw.toString(),
              sellPrice.toString(),
              priceFilter.tickSize,
            );
            const normalizedSell: Order = {
              orderId: Number(sellOrder.orderId),
              price: String(sellOrder.price),
              origQty: String(sellOrder.origQty),
              timestamp: Date.now(),
              isSell: true,
            };
            this.openSellOrders.set(i, normalizedSell);
            this.logSuccess(
              `SELL order created ID: ${normalizedSell.orderId} at level ${i} with price ${sellPrice}`,
            );
          } catch (err) {
            this.logError(`Error creating SELL order level ${i}: ${this.describeError(err)}`);
          }

          if (stopLossMargin > 0) {
            const stopLossPriceRaw = buyPrice * (1 - stopLossMargin);
            const stopLossPrice = this.roundToStep(
              stopLossPriceRaw,
              priceFilter.tickSize,
            );
            try {
              const slOrder = await this.binanceService.createStopLossOrder(
                this.symbol,
                'SELL',
                quantityRaw.toString(),
                stopLossPrice.toString(),
              );
              const normalizedSl: Order = {
                orderId: Number(slOrder?.orderId ?? Date.now()),
                price: String(slOrder?.price ?? stopLossPrice),
                origQty: String(slOrder?.origQty ?? quantityRaw),
                timestamp: Date.now(),
              };
              this.openStopLossOrders.set(i, normalizedSl);
              this.logInfo(
                `Stop Loss order created at ${stopLossPrice} for level ${i}`,
              );
            } catch (err) {
              this.logError(`Error creating Stop Loss order level ${i}: ${this.describeError(err)}`);
            }
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(
            `Order ID ${order.orderId} level ${i} is stuck, canceling...`,
          );
          try {
            await this.binanceService.cancelOrder(this.symbol, order.orderId);
            this.canceledCount++;
            this.openBuyOrders.delete(i);
            toReinsertLevels.add(i);
          } catch (e) {
            this.logError(
              `Error canceling stuck order ID ${order.orderId}: ${this.describeError(e)}`,
            );
          }
        }
      } catch (err) {
        if (this.isUnknownOrderError(err)) {
          this.logWarn(
            `BUY order ID ${order.orderId} level ${i} ya no existe en Binance — liberando nivel.`,
          );
          this.openBuyOrders.delete(i);
          continue;
        }
        this.logError(
          `Error checking BUY order status ID ${order.orderId}: ${this.describeError(err)}`,
        );
      }
    }

    if (toReinsertLevels.size > 0) {
      await this.reinsertOrders(
        Array.from(toReinsertLevels),
        priceFilter,
        lotSizeFilter,
        currentPrice,
      );
    }
  }

  private async checkStopLossOrders() {
    for (const [i, order] of Array.from(this.openStopLossOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkOrderStatus(
          this.symbol,
          order.orderId,
        );
        if (statusData.status === 'FILLED') {
          const fillPrice = parseFloat(
            statusData.filledPrice ?? statusData.price ?? order.price,
          );
          this.logWarn(
            `STOP-LOSS filled level ${i} ID ${order.orderId} @ ${fillPrice}`,
          );
          this.openStopLossOrders.delete(i);
          const pairedSell = this.openSellOrders.get(i);
          if (pairedSell) {
            try {
              await this.binanceService.cancelOrder(
                this.symbol,
                pairedSell.orderId,
              );
            } catch (e) {
              this.logError(
                `Error canceling paired SELL ${pairedSell.orderId}: ${this.describeError(e)}`,
              );
            }
            this.openSellOrders.delete(i);
          }
          const pnl = await this.pnl.closeLeg(i, fillPrice, order.orderId);
          if (pnl !== null) {
            this.profitLoss += pnl;
            this.logWarn(`Loss recorded level ${i}: ${pnl.toFixed(8)}`);
          }
        } else if (
          statusData.status === 'CANCELED' ||
          statusData.status === 'EXPIRED' ||
          statusData.status === 'REJECTED'
        ) {
          this.openStopLossOrders.delete(i);
        }
      } catch (err) {
        if (this.isUnknownOrderError(err)) {
          this.logWarn(
            `STOP-LOSS ID ${order.orderId} nivel ${i} ya no existe en Binance — liberando nivel.`,
          );
          this.openStopLossOrders.delete(i);
          continue;
        }
        this.logError(
          `Error checking STOP-LOSS status ID ${order.orderId}: ${this.describeError(err)}`,
        );
      }
    }
  }

  // Nuevo método para chequear órdenes de venta con lógica similar a buy
  private async checkSellOrders(
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openSellOrders.entries())) {
      try {
        const statusData = await this.binanceService.checkOrderStatus(
          this.symbol,
          order.orderId,
        );

        if (statusData.status === 'FILLED') {
          this.filledSellCount++;
          this.logSuccess(
            `Order SELL level ${i} completed ID: ${order.orderId}`,
          );
          this.openSellOrders.delete(i);
          const pairedSl = this.openStopLossOrders.get(i);
          if (pairedSl) {
            try {
              await this.binanceService.cancelOrder(
                this.symbol,
                pairedSl.orderId,
              );
            } catch (e) {
              this.logError(
                `Error canceling paired STOP-LOSS ${pairedSl.orderId}: ${this.describeError(e)}`,
              );
            }
            this.openStopLossOrders.delete(i);
          }
          await this.pnl.closeLeg(i, parseFloat(order.price), order.orderId);
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(
            `SELL order ID ${order.orderId} level ${i} stuck, canceling...`,
          );
          try {
            await this.binanceService.cancelOrder(this.symbol, order.orderId);
            this.canceledCount++;
            this.openSellOrders.delete(i);
            // Opcional: reinsertar órdenes de compra o manejar según diseño
          } catch (e) {
            this.logError(
              `Error canceling stuck SELL order ID ${order.orderId}: ${this.describeError(e)}`,
            );
          }
        }
      } catch (err) {
        if (this.isUnknownOrderError(err)) {
          this.logWarn(
            `SELL order ID ${order.orderId} level ${i} ya no existe en Binance — liberando nivel.`,
          );
          this.openSellOrders.delete(i);
          continue;
        }
        this.logError(
          `Error checking SELL order status ID ${order.orderId}: ${this.describeError(err)}`,
        );
      }
    }
  }

  private async reinsertOrders(
    levels: number[],
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const lowerPrice = this.config.lowerPrice;
    const upperPrice = this.config.upperPrice;
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      let buyPriceRaw = lowerPrice + i * gridStep;
      buyPriceRaw *= 0.9995;
      const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
      const rawQty = (this.config.totalQuantity || 0) / this.config.gridCount;
      const quantity = this.enforceMinNotional(rawQty, buyPrice, lotSizeFilter);

      this.logInfo(
        `Reinserting LIMIT BUY level ${i} price=${buyPrice} qty=${quantity} notional=${(quantity * buyPrice).toFixed(4)}`,
      );

      try {
        const order = await this.placeLimit(
          'BUY',
          quantity.toString(),
          buyPrice.toString(),
          priceFilter.tickSize,
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price),
          origQty: String(order.origQty),
          timestamp: Date.now(),
        };
        this.openBuyOrders.set(i, normalizedOrder);
        this.logSuccess(
          `Reinserted BUY order created ID: ${normalizedOrder.orderId} at level ${i}`,
        );
      } catch (err: any) {
        const bmsg = err?.response?.data?.msg ?? err?.message ?? String(err);
        const bcode = err?.response?.data?.code;
        this.logError(
          `Error reinsert BUY level ${i} → Binance code=${bcode} msg=${bmsg}`,
        );
      }

      await this.sleep(250);
    }
  }

  private isPostOnly(): boolean {
    return this.config.postOnly !== false;
  }

  private isMakerRejection(err: any): boolean {
    const code = err?.response?.data?.code;
    const msg = String(err?.response?.data?.msg ?? '').toLowerCase();
    return (
      code === -2010 ||
      code === -1013 ||
      msg.includes('immediately match') ||
      msg.includes('post_only') ||
      msg.includes('post only')
    );
  }

  private async placeLimit(
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    tickSize?: string,
  ): Promise<any> {
    if (!this.isPostOnly()) {
      return this.binanceService.createLimitOrder(
        this.symbol,
        side,
        quantity,
        price,
        'GTC',
      );
    }
    try {
      return await this.binanceService.createLimitMakerOrder(
        this.symbol,
        side,
        quantity,
        price,
      );
    } catch (err: any) {
      if (!this.isMakerRejection(err) || !tickSize) throw err;
      const tick = parseFloat(tickSize);
      const numPrice = parseFloat(price);
      const shifted = side === 'BUY' ? numPrice - tick : numPrice + tick;
      const retryPrice = this.roundToStep(shifted, tickSize);
      this.logWarn(
        `LIMIT_MAKER ${side} rejected @${price}, retrying @${retryPrice}`,
      );
      return this.binanceService.createLimitMakerOrder(
        this.symbol,
        side,
        quantity,
        retryPrice.toString(),
      );
    }
  }

  // Mejora en función para ajustes numéricos al step con precisión decimal exacta y redondeo hacia abajo para evitar errores
  // Nunca loguear el error de axios crudo: trae headers con el API key en
  // texto plano (X-MBX-APIKEY) dentro del objeto de config de la request.
  private describeError(err: any): string {
    return (
      err?.response?.data?.msg ??
      (err?.response?.data ? JSON.stringify(err.response.data) : undefined) ??
      err?.message ??
      String(err)
    );
  }

  // -2011 "Unknown order sent" / -2013 "Order does not exist": Binance ya no
  // tiene esa orden. Sin esto, el nivel queda "ocupado" por un fantasma para
  // siempre y nunca se libera para una orden nueva.
  private isUnknownOrderError(err: any): boolean {
    const code = err?.response?.data?.code;
    return code === -2011 || code === -2013;
  }

  private roundToStep(value: number, step: string): number {
    const stepFloat = parseFloat(step);
    const precision = (step.split('.')[1] || '').length;
    const adjusted = Math.floor(value / stepFloat) * stepFloat;
    return parseFloat(adjusted.toFixed(precision));
  }

  private ceilToStep(value: number, step: string): number {
    const stepFloat = parseFloat(step);
    const precision = (step.split('.')[1] || '').length;
    const adjusted = Math.ceil(value / stepFloat) * stepFloat;
    return parseFloat(adjusted.toFixed(precision));
  }

  // Fuerza qty >= minOrderNotional/price y qty >= stepSize; redondea al step.
  private enforceMinNotional(
    qty: number,
    price: number,
    lotSizeFilter: any,
  ): number {
    const stepSize = lotSizeFilter.stepSize as string;
    const stepFloat = parseFloat(stepSize);
    const minNotional = this.config.minOrderNotional ?? 0;
    let out = qty;
    if (minNotional > 0 && price > 0) {
      const minQtyByNotional = minNotional / price;
      if (out < minQtyByNotional) out = minQtyByNotional;
      out = this.ceilToStep(out, stepSize);
    } else {
      out = this.roundToStep(out, stepSize);
    }
    if (out < stepFloat) out = stepFloat;
    return out;
  }

  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  private calculateSleepDuration(): number {
    const minMs = this.config.minSleepMs ?? 15000;
    const maxMs = this.config.maxSleepMs ?? minMs;
    if (maxMs <= minMs) return minMs;
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }

  private async exponentialBackoff(baseDelayMs: number, maxRetries: number) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const waitTime = baseDelayMs * Math.pow(2, attempt);
      this.logInfo(`Retrying in ${waitTime} ms...`);
      await this.sleep(waitTime);
    }
  }

  private logSuccess(message: string, ...args: any[]) {
    this.logger.log(`${COLORS.fgGreen}${message}${COLORS.reset}`, ...args);
  }

  private logInfo(message: string, ...args: any[]) {
    this.logger.log(`${COLORS.fgCyan}${message}${COLORS.reset}`, ...args);
  }

  private logWarn(message: string, ...args: any[]) {
    this.logger.warn(
      `${COLORS.fgYellow}ALERTA: ${message}${COLORS.reset}`,
      ...args,
    );
  }

  private logError(message: string, ...args: any[]) {
    this.logger.error(`${COLORS.fgRed}${message}${COLORS.reset}`, ...args);
  }

  getProfitLoss() {
    return this.profitLoss;
  }

  /**
   * Estado en tiempo real para dashboard "detalle del bot".
   * Cubre bots reales (dryRun=false) donde PaperOrder no aplica.
   */
  getRuntimeStatus() {
    return {
      symbol: this.symbol,
      id: this.id,
      openBuyOrders: this.openBuyOrders.size,
      openSellOrders: this.openSellOrders.size,
      openStopLossOrders: this.openStopLossOrders.size,
      skippedLevels: this.skippedLevels.size,
      manualLevels: this.manualLevels.size,
      filledBuyCount: this.filledBuyCount,
      filledSellCount: this.filledSellCount,
      filledCount: this.filledBuyCount + this.filledSellCount,
      canceledCount: this.canceledCount,
      profitLoss: this.profitLoss,
      lowerPrice: this.config.lowerPrice,
      upperPrice: this.config.upperPrice,
      rangeAdjustCount: this.rangeAdjustCount,
      buyLevels: Array.from(this.openBuyOrders.entries()).map(([level, o]) => ({
        level,
        orderId: o.orderId,
        price: o.price,
        qty: o.origQty,
        ageMs: Date.now() - o.timestamp,
      })),
      sellLevels: Array.from(this.openSellOrders.entries()).map(
        ([level, o]) => ({
          level,
          orderId: o.orderId,
          price: o.price,
          qty: o.origQty,
          ageMs: Date.now() - o.timestamp,
        }),
      ),
    };
  }

  /**
   * Coloca una orden manual con precio y cantidad específicos.
   * - Si solo se pasa price → qty se calcula desde `minOrderNotional` o del grid uniforme.
   * - Nivel manual usa índice negativo decreciente para no colisionar con grid.
   */
  public async addOrderLevel(input: {
    price: number;
    quantity?: number;
    id?: number;
  }): Promise<any> {
    const { priceFilter, lotSizeFilter } =
      await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    const priceAdj = this.roundToStep(input.price, priceFilter.tickSize);

    let rawQty: number;
    if (input.quantity && input.quantity > 0) {
      rawQty = input.quantity;
    } else if (this.config.uniformQuantity && this.config.totalQuantity > 0) {
      rawQty = this.config.totalQuantity / this.config.gridCount;
    } else {
      rawQty = 0;
    }
    const qtyAdj = this.enforceMinNotional(rawQty, priceAdj, lotSizeFilter);
    const notional = qtyAdj * priceAdj;

    this.logInfo(
      `Manual BUY level id=${input.id ?? 'auto'} price=${priceAdj} qty=${qtyAdj} notional=${notional.toFixed(4)}`,
    );

    try {
      const order = await this.placeLimit(
        'BUY',
        qtyAdj.toString(),
        priceAdj.toString(),
        priceFilter.tickSize,
      );
      const normalized: Order = {
        orderId: Number(order.orderId),
        price: String(order.price ?? priceAdj),
        origQty: String(order.origQty ?? qtyAdj),
        timestamp: Date.now(),
      };
      // levels negativos → manuales, no colisionan con grid (0..gridCount)
      const manualIdx = -(this.manualLevels.size + 1);
      this.manualLevels.set(manualIdx, normalized);
      this.openBuyOrders.set(manualIdx, normalized);
      this.logSuccess(
        `Manual BUY colocada ID=${normalized.orderId} nivel manual ${manualIdx}`,
      );
      return {
        ok: true,
        level: manualIdx,
        orderId: normalized.orderId,
        price: priceAdj,
        quantity: qtyAdj,
        notional,
      };
    } catch (err: any) {
      const bmsg = err?.response?.data?.msg ?? err?.message ?? String(err);
      const bcode = err?.response?.data?.code;
      this.logError(
        `Error manual BUY price=${priceAdj} qty=${qtyAdj} → Binance code=${bcode} msg=${bmsg}`,
      );
      throw new Error(`Binance ${bcode}: ${bmsg}`);
    }
  }

  public async removeOrderLevel(levelIndex: number): Promise<any> {
    const order =
      this.openBuyOrders.get(levelIndex) ?? this.openSellOrders.get(levelIndex);
    if (!order) throw new Error(`Nivel ${levelIndex} no encontrado`);
    try {
      await this.binanceService.cancelOrder(this.symbol, order.orderId);
      this.canceledCount++;
      this.openBuyOrders.delete(levelIndex);
      this.openSellOrders.delete(levelIndex);
      this.manualLevels.delete(levelIndex);
      this.logSuccess(
        `Nivel ${levelIndex} cancelado (orderId=${order.orderId})`,
      );
      return { ok: true, level: levelIndex, orderId: order.orderId };
    } catch (err: any) {
      const bmsg = err?.response?.data?.msg ?? err?.message ?? String(err);
      throw new Error(`Cancel falló: ${bmsg}`);
    }
  }

  /**
   * Aplica patch de config en caliente. Solo campos que no requieren re-armar el grid.
   * (Los estructurales se aplican por restart desde BotService.updateStrategyConfig).
   */
  onConfigUpdate(patch: Record<string, any>): void {
    const HOT = [
      'profitMargin',
      'buySafetyMargin',
      'stopLossMargin',
      'maxOrderAgeMs',
      'minSleepMs',
      'maxSleepMs',
      'autoAdjustRange',
      'rangeEdgeBufferPct',
      'rangeAdjustCooldownMs',
    ];
    const applied: string[] = [];
    for (const k of HOT) {
      if (patch[k] !== undefined) {
        (this.config as any)[k] = patch[k];
        applied.push(`${k}=${patch[k]}`);
      }
    }
    if (applied.length) {
      this.logInfo(`Config hot-update: ${applied.join(', ')}`);
    }
  }

  updateProfitMargin(newProfitMargin: number): void {
    this.config.profitMargin = newProfitMargin;
    this.logInfo(`profitMargin actualizado en caliente: ${newProfitMargin}`);
  }
}
