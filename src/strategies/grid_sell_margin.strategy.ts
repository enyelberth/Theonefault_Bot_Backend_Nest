import { Injectable, Logger } from '@nestjs/common';
import { OrderSide } from '@prisma/client';
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
export class GridSellMarginStrategy implements TradingStrategy {
  id: string;
  symbol: string;
  config: {
    gridCount: number;
    totalQuantity: number;
    profitMargin: number;
    maxOrderAgeMs?: number;
    stopLossMargin?: number;
    minSleepMs?: number;
    maxSleepMs?: number;
    buySafetyMargin?: number; // Porcentaje (ej. 0.001 = 0.1%)
    // Si ambos están definidos, usa una caja FIJA [lowerPrice, upperPrice] en vez
    // del rango flotante (currentPrice .. currentPrice*(1+profitMargin*gridCount)).
    lowerPrice?: number;
    upperPrice?: number;
    minOrderNotional?: number; // Notional mínimo por orden (USDT). Sube qty si es menor.
  };

  private readonly logger = new Logger(GridSellMarginStrategy.name);
  private openBuyOrders = new Map<number, Order>();
  private openSellOrders = new Map<number, Order>();
  private openStopLossOrders = new Map<number, Order>();
  private isRunning = true;

  private profitLoss = 0; // Variable para acumulación de ganancia/pérdida
  private pnl = new PnlTracker();

  constructor(private readonly binanceService: BinanceService) {}

  attachPnlReporter(reporter: StrategyPnlReporter): void {
    this.pnl.attach(reporter);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  async run() {
    this.logInfo(
      `Starting Grid Sell on ${this.symbol} with config: ${JSON.stringify(this.config)}`,
    );

    const { priceFilter, lotSizeFilter } =
      await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter)
      throw new Error(`Filters not found for ${this.symbol}`);

    await this.cancelExistingOrdersInRange(0, Number.MAX_VALUE);

    while (this.isRunning) {
      try {
        const currentPrice = await this.getCurrentPrice();

        const lowerPrice = this.config.lowerPrice ?? currentPrice;
        const upperPrice =
          this.config.upperPrice ??
          currentPrice * (1 + this.config.profitMargin * this.config.gridCount);
        await this.placeSellOrders(
          lowerPrice,
          upperPrice,
          priceFilter,
          lotSizeFilter,
          currentPrice,
        );

        await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);
        await this.checkBuyOrdersClosings();
        await this.checkStopLossOrders();

        await this.pnl.snapshot(this.openBuyOrders.size, currentPrice, {
          openSells: this.openSellOrders.size,
        });

        const sleepDuration = this.calculateSleepDuration();
        this.logInfo(`Sleeping ${sleepDuration} ms`);
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

  private async cancelExistingOrdersInRange(
    lowerPrice: number,
    upperPrice: number,
  ) {
    try {
      const allOrders = await this.binanceService.getAllCrossMarginOrders(
        this.symbol,
        500,
      );
      for (const o of allOrders) {
        const status = o.status;
        if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(status))
          continue;
        const p = Number(o.price);
        if (!Number.isFinite(p)) continue;
        if (o.side === 'SELL' && p >= lowerPrice && p <= upperPrice) {
          try {
            await this.binanceService.cancelCrossMarginOrder(
              this.symbol,
              o.orderId,
            );
            this.logWarn(
              `ALERTA: Orden de VENTA abierta cancelada ID ${o.orderId} precio ${o.price} dentro del rango [${lowerPrice}, ${upperPrice}]`,
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

  private async placeSellOrders(
    lowerPrice: number,
    upperPrice: number,
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;
    let qtySum = 0;

    for (let i = 0; i <= this.config.gridCount; i++) {
      if (this.openSellOrders.has(i)) continue;

      const sellPriceRaw = lowerPrice + i * gridStep;
      if (sellPriceRaw <= currentPrice) {
        // Omitir niveles por debajo del precio actual
        continue;
      }

      const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);

      let quantity = this.config.totalQuantity / this.config.gridCount;
      quantity = Math.min(quantity, Math.max(0, this.config.totalQuantity - qtySum));
      const adjQuantity = this.enforceMinNotional(
        quantity,
        sellPrice,
        lotSizeFilter,
      );
      qtySum += adjQuantity;
      if (adjQuantity <= 0) {
        this.logWarn(`Nivel ${i} qty=0 tras redondeo -> omitido`);
        continue;
      }

      this.logInfo(
        `Placing LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${adjQuantity}`,
      );

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'SELL',
          adjQuantity.toString(),
          sellPrice.toString(),
          'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price ?? sellPrice),
          origQty: String(order.origQty ?? adjQuantity),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logSuccess(
          `SELL order created ID: ${normalizedOrder.orderId} at level ${i}`,
        );
      } catch (err) {
        this.logError(`Error creating SELL order at level ${i}: ${this.describeError(err)}`);
      }

      await this.sleep(250);
    }
  }

  private async checkSellOrders(
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;
    const toReinsertLevels = new Set<number>();

    for (const [i, order] of Array.from(this.openSellOrders.entries())) {
      try {
        const statusData =
          await this.binanceService.checkCrossMarginOrderStatus(
            this.symbol,
            order.orderId,
          );

        if (statusData.status === 'FILLED') {
          this.logSuccess(
            `Order SELL level ${i} completed ID: ${order.orderId}`,
          );
          this.openSellOrders.delete(i);

          // Crear orden de compra contraparte
          const buyPriceRaw =
            parseFloat(order.price) *
            (1 - (this.config.buySafetyMargin ?? 0.001));
          const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
          const quantity = this.roundToStep(
            parseFloat(order.origQty),
            lotSizeFilter.stepSize,
          );

          // Sell grid: SELL primero = apertura leg SHORT (side=SELL)
          this.pnl.openLeg(
            i,
            parseFloat(order.price),
            quantity,
            OrderSide.SELL,
          );

          this.logInfo(
            `Placing BUY order contraparte for completed SELL order level ${i}, price ${buyPrice}, quantity ${quantity}`,
          );

          try {
            const buyOrder =
              await this.binanceService.createCrossMarginLimitOrder(
                this.symbol,
                'BUY',
                quantity.toString(),
                buyPrice.toString(),
                'GTC',
              );
            const normalizedBuyOrder: Order = {
              orderId: Number(buyOrder.orderId),
              price: String(buyOrder.price),
              origQty: String(buyOrder.origQty),
              timestamp: Date.now(),
            };
            this.openBuyOrders.set(i, normalizedBuyOrder);
            this.logSuccess(
              `BUY order contraparte created ID: ${normalizedBuyOrder.orderId} at level ${i}`,
            );
          } catch (err) {
            this.logError(
              `Error creating BUY order contraparte at level ${i}: ${this.describeError(err)}`,
            );
          }

          // Corto: pierde si el precio SUBE, no si baja. Stop-loss es un BUY
          // que cubre la posición si el precio supera entry*(1+stopLossMargin).
          const stopLossMargin = this.config.stopLossMargin ?? 0.02;
          if (stopLossMargin > 0) {
            const stopLossPriceRaw =
              parseFloat(order.price) * (1 + stopLossMargin);
            const stopLossPrice = this.roundToStep(
              stopLossPriceRaw,
              priceFilter.tickSize,
            );
            try {
              const slOrder =
                await this.binanceService.createCrossMarginStopLossOrder(
                  this.symbol,
                  'BUY',
                  quantity.toString(),
                  stopLossPrice.toString(),
                );
              const normalizedSl: Order = {
                orderId: Number(slOrder?.orderId ?? Date.now()),
                price: String(slOrder?.price ?? stopLossPrice),
                origQty: String(slOrder?.origQty ?? quantity),
                timestamp: Date.now(),
              };
              this.openStopLossOrders.set(i, normalizedSl);
              this.logInfo(
                `Stop-loss (cobertura) creado a ${stopLossPrice} para nivel ${i}`,
              );
            } catch (err) {
              this.logError(`Error creando stop-loss nivel ${i}: ${this.describeError(err)}`);
            }
          }
        } else if (Date.now() - order.timestamp > maxAgeMs) {
          this.logWarn(
            `SELL order ID ${order.orderId} level ${i} stuck, canceling...`,
          );
          try {
            await this.binanceService.cancelCrossMarginOrder(
              this.symbol,
              order.orderId,
            );
            this.openSellOrders.delete(i);
            toReinsertLevels.add(i);
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

    if (toReinsertLevels.size > 0) {
      await this.reinsertSellOrders(
        Array.from(toReinsertLevels),
        priceFilter,
        lotSizeFilter,
        currentPrice,
      );
    }
  }

  private async checkBuyOrdersClosings() {
    for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
      try {
        const statusData =
          await this.binanceService.checkCrossMarginOrderStatus(
            this.symbol,
            order.orderId,
          );
        if (statusData.status === 'FILLED') {
          this.logSuccess(
            `Order BUY (closing) level ${i} completed ID: ${order.orderId}`,
          );
          this.openBuyOrders.delete(i);
          const pairedSl = this.openStopLossOrders.get(i);
          if (pairedSl) {
            try {
              await this.binanceService.cancelCrossMarginOrder(
                this.symbol,
                pairedSl.orderId,
              );
            } catch (e) {
              this.logError(
                `Error cancelando stop-loss emparejado ${pairedSl.orderId}: ${this.describeError(e)}`,
              );
            }
            this.openStopLossOrders.delete(i);
          }
          await this.pnl.closeLeg(i, parseFloat(order.price), order.orderId);
        }
      } catch (err) {
        if (this.isUnknownOrderError(err)) {
          this.logWarn(
            `BUY (closing) order ID ${order.orderId} level ${i} ya no existe en Binance — liberando nivel.`,
          );
          this.openBuyOrders.delete(i);
          continue;
        }
        this.logError(
          `Error checking BUY closing status ID ${order.orderId}: ${this.describeError(err)}`,
        );
      }
    }
  }

  private async checkStopLossOrders() {
    for (const [i, order] of Array.from(this.openStopLossOrders.entries())) {
      try {
        const statusData =
          await this.binanceService.checkCrossMarginOrderStatus(
            this.symbol,
            order.orderId,
          );
        if (statusData.status === 'FILLED') {
          const fillPrice = parseFloat(
            statusData.filledPrice ?? statusData.price ?? order.price,
          );
          this.logWarn(
            `STOP-LOSS (cobertura) disparado nivel ${i} ID ${order.orderId} @ ${fillPrice}`,
          );
          this.openStopLossOrders.delete(i);
          const pairedBuy = this.openBuyOrders.get(i);
          if (pairedBuy) {
            try {
              await this.binanceService.cancelCrossMarginOrder(
                this.symbol,
                pairedBuy.orderId,
              );
            } catch (e) {
              this.logError(
                `Error cancelando BUY de cierre emparejado ${pairedBuy.orderId}: ${this.describeError(e)}`,
              );
            }
            this.openBuyOrders.delete(i);
          }
          const pnl = await this.pnl.closeLeg(i, fillPrice, order.orderId);
          if (pnl !== null) {
            this.profitLoss += pnl;
            this.logWarn(`Pérdida registrada nivel ${i}: ${pnl.toFixed(8)}`);
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

  private async reinsertSellOrders(
    levels: number[],
    priceFilter: any,
    lotSizeFilter: any,
    currentPrice: number,
  ) {
    const lowerPrice = this.config.lowerPrice ?? currentPrice;
    const upperPrice =
      this.config.upperPrice ??
      currentPrice * (1 + this.config.profitMargin * this.config.gridCount);
    const gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

    for (const i of levels) {
      const sellPriceRaw = lowerPrice + i * gridStep;
      const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);
      const quantity = this.enforceMinNotional(
        this.config.totalQuantity / this.config.gridCount,
        sellPrice,
        lotSizeFilter,
      );

      this.logInfo(
        `Reinserting LIMIT SELL order level ${i}, price ${sellPrice}, quantity ${quantity}`,
      );

      try {
        const order = await this.binanceService.createCrossMarginLimitOrder(
          this.symbol,
          'SELL',
          quantity.toString(),
          sellPrice.toString(),
          'GTC',
        );
        const normalizedOrder: Order = {
          orderId: Number(order.orderId),
          price: String(order.price),
          origQty: String(order.origQty),
          timestamp: Date.now(),
          isSell: true,
        };
        this.openSellOrders.set(i, normalizedOrder);
        this.logSuccess(
          `Reinserted SELL order created ID: ${normalizedOrder.orderId} at level ${i}`,
        );
      } catch (err) {
        this.logError(`Error reinserting SELL order at level ${i}: ${this.describeError(err)}`);
      }

      await this.sleep(250);
    }
  }

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

  /** Estado en tiempo real para dashboard "detalle del bot". */
  getRuntimeStatus() {
    return {
      symbol: this.symbol,
      id: this.id,
      openBuyOrders: this.openBuyOrders.size,
      openSellOrders: this.openSellOrders.size,
      openStopLossOrders: this.openStopLossOrders.size,
      profitLoss: this.profitLoss,
      lowerPrice: this.config.lowerPrice ?? null,
      upperPrice: this.config.upperPrice ?? null,
      buyLevels: Array.from(this.openBuyOrders.entries()).map(
        ([level, o]) => ({
          level,
          orderId: o.orderId,
          price: o.price,
          qty: o.origQty,
          ageMs: Date.now() - o.timestamp,
        }),
      ),
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
   * Coloca una orden manual SELL (abre corto) con precio y cantidad
   * específicos. Nivel manual usa índice negativo decreciente.
   */
  public async addOrderLevel(input: {
    price: number;
    quantity?: number;
  }): Promise<any> {
    const { priceFilter, lotSizeFilter } =
      await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    const priceAdj = this.roundToStep(input.price, priceFilter.tickSize);

    const rawQty =
      input.quantity && input.quantity > 0
        ? input.quantity
        : this.config.totalQuantity / this.config.gridCount;
    const qtyAdj = this.enforceMinNotional(rawQty, priceAdj, lotSizeFilter);
    const notional = qtyAdj * priceAdj;

    this.logInfo(
      `Manual SELL price=${priceAdj} qty=${qtyAdj} notional=${notional.toFixed(4)}`,
    );

    try {
      const order = await this.binanceService.createCrossMarginLimitOrder(
        this.symbol,
        'SELL',
        qtyAdj.toString(),
        priceAdj.toString(),
        'GTC',
      );
      const normalized: Order = {
        orderId: Number(order.orderId),
        price: String(order.price ?? priceAdj),
        origQty: String(order.origQty ?? qtyAdj),
        timestamp: Date.now(),
        isSell: true,
      };
      const manualIdx = -(
        Array.from(this.openSellOrders.keys()).filter((k) => k < 0).length + 1
      );
      this.openSellOrders.set(manualIdx, normalized);
      this.logSuccess(
        `Manual SELL colocada ID=${normalized.orderId} nivel manual ${manualIdx}`,
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
      throw new Error(`Binance: ${bmsg}`);
    }
  }

  /** Cancela cualquier nivel (grid o manual) por su índice. */
  public async removeOrderLevel(levelIndex: number): Promise<any> {
    const order = this.openSellOrders.get(levelIndex);
    if (!order) throw new Error(`Nivel ${levelIndex} no encontrado`);
    try {
      await this.binanceService.cancelCrossMarginOrder(
        this.symbol,
        order.orderId,
      );
      this.openSellOrders.delete(levelIndex);
      this.logSuccess(`Nivel ${levelIndex} cancelado (orderId=${order.orderId})`);
      return { ok: true, level: levelIndex, orderId: order.orderId };
    } catch (err: any) {
      const bmsg = err?.response?.data?.msg ?? err?.message ?? String(err);
      throw new Error(`Cancel falló: ${bmsg}`);
    }
  }

  /**
   * Resize en caliente: nuevo [lowerPrice, upperPrice] (y opcional gridCount).
   * Cancela solo las SELL sin llenar que quedaron fuera de la caja nueva —
   * openBuyOrders/openStopLossOrders (posiciones ya abiertas, cubriendo un
   * short) no se tocan, siguen esperando su propio cierre.
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

    const oldLower = this.config.lowerPrice;
    const oldUpper = this.config.upperPrice;
    const oldGridCount = this.config.gridCount;

    this.config.lowerPrice = input.lowerPrice;
    this.config.upperPrice = input.upperPrice;
    if (input.gridCount !== undefined && input.gridCount >= 2) {
      this.config.gridCount = input.gridCount;
    }

    this.logWarn(
      `Rango ajustado (manual): [${oldLower}, ${oldUpper}] gridCount=${oldGridCount} -> [${input.lowerPrice}, ${input.upperPrice}] gridCount=${this.config.gridCount} (precio actual ${currentPrice})`,
    );

    let canceled = 0;
    for (const [i, order] of Array.from(this.openSellOrders.entries())) {
      const p = parseFloat(order.price);
      if (p < input.lowerPrice || p > input.upperPrice) {
        try {
          await this.binanceService.cancelCrossMarginOrder(
            this.symbol,
            order.orderId,
          );
          canceled++;
        } catch (e) {
          this.logError(
            `Error cancelando orden fuera de rango nivel ${i}: ${this.describeError(e)}`,
          );
        }
        this.openSellOrders.delete(i);
      }
    }

    await this.placeSellOrders(
      input.lowerPrice,
      input.upperPrice,
      priceFilter,
      lotSizeFilter,
      currentPrice,
    );

    return { ok: true, canceled, placed: this.openSellOrders.size };
  }
}
