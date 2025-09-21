import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

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
    };

    private readonly logger = new Logger(GridSellMarginStrategy.name);
    private openBuyOrders = new Map<number, Order>();
    private openSellOrders = new Map<number, Order>();
    private isRunning = true;

    private profitLoss = 0; // Variable para acumulación de ganancia/pérdida

    constructor(private readonly binanceService: BinanceService) {}

    async run() {
        this.logInfo(`Starting Grid Sell on ${this.symbol} with config: ${JSON.stringify(this.config)}`);

        const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
        if (!priceFilter || !lotSizeFilter) throw new Error(`Filters not found for ${this.symbol}`);

        await this.cancelExistingOrdersInRange(0, Number.MAX_VALUE);

        while (this.isRunning) {
            try {
                const currentPrice = await this.getCurrentPrice();

               // this.logInfo(`${currentPrice}  aaa ${priceFilter} eee${lotSizeFilter}`);

                // Colocar órdenes de venta por encima
                await this.placeSellOrdersAboveCurrent(currentPrice, priceFilter, lotSizeFilter);

                // Revisar órdenes de venta completadas para colocar contraparte de compra
                await this.checkSellOrders(priceFilter, lotSizeFilter, currentPrice);

                const sleepDuration = this.calculateSleepDuration();
                this.logInfo(`Sleeping ${sleepDuration} ms`);
                await this.sleep(sleepDuration);
            } catch (err) {
                this.logError('Error in monitoring loop:', err);
                await this.exponentialBackoff(30000, 5);
            }
        }
    }

    private async getCurrentPrice(): Promise<number> {
        const resp = await this.binanceService.getSymbolPrice(this.symbol);
        return parseFloat(resp.price);
    }

    private async cancelExistingOrdersInRange(lowerPrice: number, upperPrice: number) {
        try {
            const allOrders = await this.binanceService.getAllCrossMarginOrders(this.symbol, 500);

            for (const o of allOrders) {
                const status = o.status;
                if (['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED'].includes(status)) continue;
                const p = Number(o.price);
                if (!Number.isFinite(p)) continue;
                if (p >= lowerPrice && p <= upperPrice) {
                    try {
                        await this.binanceService.cancelCrossMarginOrder(this.symbol, o.orderId);
                        this.logWarn(`ALERTA: Orden abierta cancelada ID ${o.orderId} precio ${o.price} dentro del rango [${lowerPrice}, ${upperPrice}]`);
                    } catch (err) {
                        this.logError(`Error al cancelar orden ID ${o.orderId}:`, err);
                    }
                }
            }
        } catch (err) {
            this.logError('Error obteniendo/cancelando órdenes existentes:', err);
        }
    }

    private async placeSellOrdersAboveCurrent(
        currentPrice: number,
        priceFilter: any,
        lotSizeFilter: any
    ) {
        const gridCount = this.config.gridCount;
        const totalQty = this.config.totalQuantity;
        const profitMargin = this.config.profitMargin;
        const gridStep = profitMargin * currentPrice; // Paso del grid basado en margen de beneficio

        let qtySum = 0;

        for (let i = 1; i <= gridCount; i++) {
            // Si ya hay orden abierta en este nivel, saltar
            if (this.openSellOrders.has(i)) continue;

            const sellPriceRaw = currentPrice + i * gridStep;
            const sellPrice = this.roundToStep(sellPriceRaw, priceFilter.tickSize);

            let quantity = totalQty / gridCount;
            quantity = Math.min(quantity, totalQty - qtySum);
            qtySum += quantity;
            const adjQuantity = this.roundToStep(quantity, lotSizeFilter.stepSize);

            this.logInfo(`Placing SELL order level ${i}, price ${sellPrice}, quantity ${adjQuantity}`);

            try {
                const order = await this.binanceService.createCrossMarginLimitOrder(
                    this.symbol,
                    'SELL',
                    adjQuantity.toString(),
                    sellPrice.toString(),
                    'GTC'
                );
                const normalizedOrder: Order = {
                    orderId: Number(order.orderId),
                    price: String(order.price ?? sellPrice),
                    origQty: String(order.origQty ?? adjQuantity),
                    timestamp: Date.now(),
                    isSell: true,
                };
                this.openSellOrders.set(i, normalizedOrder);
                this.logSuccess(`SELL order created ID: ${normalizedOrder.orderId} at level ${i} price ${sellPrice}`);
            } catch (error) {
                this.logError(`Error creating SELL order at level ${i}:`, error);
            }

            await this.sleep(250);
        }
    }

    private async checkSellOrders(priceFilter: any, lotSizeFilter: any, currentPrice: number) {
        const maxAgeMs = this.config.maxOrderAgeMs ?? 3600000;

        for (const [i, order] of Array.from(this.openSellOrders.entries())) {
            try {
                const statusData = await this.binanceService.checkCrossMarginOrderStatus(this.symbol, order.orderId);

                if (statusData.status === 'FILLED') {
                    this.logSuccess(`Order SELL level ${i} completed ID: ${order.orderId}`);
                    this.openSellOrders.delete(i);

                    // Crear orden de compra contraparte
                    const buyPriceRaw = currentPrice * (1 - (this.config.buySafetyMargin ?? 0.001));
                    const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
                    const quantity = this.roundToStep(parseFloat(order.origQty), lotSizeFilter.stepSize);

                    this.logInfo(`Placing BUY order contraparte for completed SELL order level ${i}, price ${buyPrice}, quantity ${quantity}`);

                    try {
                        const buyOrder = await this.binanceService.createCrossMarginLimitOrder(
                            this.symbol,
                            'BUY',
                            quantity.toString(),
                            buyPrice.toString(),
                            'GTC'
                        );
                        const normalizedBuyOrder: Order = {
                            orderId: Number(buyOrder.orderId),
                            price: String(buyOrder.price),
                            origQty: String(buyOrder.origQty),
                            timestamp: Date.now(),
                        };
                        this.openBuyOrders.set(i, normalizedBuyOrder);
                        this.logSuccess(`BUY order contraparte created ID: ${normalizedBuyOrder.orderId} at level ${i}`);
                    } catch (err) {
                        this.logError(`Error creating BUY order contraparte at level ${i}:`, err);
                    }
                } else if (Date.now() - order.timestamp > maxAgeMs) {
                    this.logWarn(`SELL order ID ${order.orderId} level ${i} stuck, canceling...`);
                    try {
                        await this.binanceService.cancelCrossMarginOrder(this.symbol, order.orderId);
                        this.openSellOrders.delete(i);
                    } catch (e) {
                        this.logError(`Error canceling stuck SELL order ID ${order.orderId}:`, e);
                    }
                }
            } catch (err) {
                this.logError(`Error checking SELL order status ID ${order.orderId}:`, err);
            }
        }
    }

    private async reinsertOrders(
        levels: number[],
        priceFilter: any,
        lotSizeFilter: any,
        currentPrice: number,
    ) {
        for (const i of levels) {
            const buyPriceRaw = currentPrice * (1 - (this.config.buySafetyMargin ?? 0.001));
            const buyPrice = this.roundToStep(buyPriceRaw, priceFilter.tickSize);
            const quantity = this.roundToStep(this.config.totalQuantity / this.config.gridCount, lotSizeFilter.stepSize);

            this.logInfo(`Reinserting LIMIT BUY order level ${i}, price ${buyPrice}, quantity ${quantity}`);

            try {
                const order = await this.binanceService.createCrossMarginLimitOrder(this.symbol, 'BUY', quantity.toString(), buyPrice.toString(), 'GTC');
                const normalizedOrder: Order = {
                    orderId: Number(order.orderId),
                    price: String(order.price),
                    origQty: String(order.origQty),
                    timestamp: Date.now(),
                };
                this.openBuyOrders.set(i, normalizedOrder);
                this.logSuccess(`Reinserted BUY order created ID: ${normalizedOrder.orderId} at level ${i}`);
            } catch (err) {
                this.logError(`Error reinserting BUY order at level ${i}:`, err);
            }

            await this.sleep(250);
        }
    }

    private roundToStep(value: number, step: string): number {
        const stepFloat = parseFloat(step);
        const precision = (step.split('.')[1] || '').length;
        const adjusted = Math.floor(value / stepFloat) * stepFloat;
        return parseFloat(adjusted.toFixed(precision));
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
        this.logger.warn(`${COLORS.fgYellow}ALERTA: ${message}${COLORS.reset}`, ...args);
    }

    private logError(message: string, ...args: any[]) {
        this.logger.error(`${COLORS.fgRed}${message}${COLORS.reset}`, ...args);
    }

    getProfitLoss() {
        return this.profitLoss;
    }
}
