import { Injectable, Logger } from '@nestjs/common';
import { TradingStrategy } from './trading-strategy.interface';
import { BinanceService } from '../binance/binance.service';

@Injectable()
export class GridBuyStrategy implements TradingStrategy {
  symbol: string;
  config: {
    gridCount: number;
    lowerPrice?: number;
    upperPrice?: number;
    totalQuantity: number;
    profitMargin: number;

    maxOrderAgeMs?: number; // máximo tiempo que una orden puede estar abierta sin ejecutarse, por ejemplo 3600000 = 1 hora
  };

  private readonly logger = new Logger(GridBuyStrategy.name);
  private openBuyOrders = new Map<number, any>(); // índice nivel => orden

  constructor(private readonly binanceService: BinanceService) {}

  async run() {
    this.logger.log(`Ejecutando Grid Buy en ${this.symbol} con config: ${JSON.stringify(this.config)}`);

    // Obtener filtros y precio inicial
    const { priceFilter, lotSizeFilter } = await this.binanceService.obtenerFiltrosSimbolo(this.symbol);
    if (!priceFilter || !lotSizeFilter) throw new Error(`No se encontraron filtros para ${this.symbol}`);

    // Estado interno para manejar rango y grilla actual
    let currentPriceResp = await this.binanceService.getSymbolPrice(this.symbol);
    let currentPrice = parseFloat(currentPriceResp.price);

    // Inicializamos rango dinámico
    let upperPrice = this.config.upperPrice && this.config.upperPrice < currentPrice ? this.config.upperPrice : currentPrice * 0.995;
    let lowerPrice = this.config.lowerPrice && this.config.lowerPrice < upperPrice ? this.config.lowerPrice : upperPrice * 0.97;
    let gridStep = (upperPrice - lowerPrice) / this.config.gridCount;
    let quantityPerGrid = this.config.totalQuantity / this.config.gridCount;

    // Función para colocar ordenes BUY en los niveles de grid
    const placeBuyOrders = async () => {
      for (let i = 0; i <= this.config.gridCount; i++) {
        if (this.openBuyOrders.has(i)) continue; // Ya hay una orden para este nivel

        const buyPriceRaw = lowerPrice + i * gridStep;
        const buyPrice = this.ajustarAlStep(buyPriceRaw, priceFilter.tickSize);
        const quantity = this.ajustarAlStep(quantityPerGrid, lotSizeFilter.stepSize);

        this.logger.log(`Colocando orden LIMIT BUY nivel ${i} precio ${buyPrice} cantidad ${quantity}`);

        try {
          const order = await this.binanceService.createLimitOrder(this.symbol, 'BUY', quantity, buyPrice, 'GTC');
          order.timestamp = Date.now();
          this.openBuyOrders.set(i, order);
          this.logger.log(`Orden BUY creada ID: ${order.orderId} en nivel ${i}`);
        } catch (error) {
          this.logger.error(`Error creando orden en nivel ${i}: ${error.message || error}`);
        }
      }
    };

    // Colocar órdenes iniciales
    await placeBuyOrders();

    // Monitor y gestor del ciclo
    while (true) {
      try {
        currentPriceResp = await this.binanceService.getSymbolPrice(this.symbol);
        currentPrice = parseFloat(currentPriceResp.price);

        // Si el precio se mueve fuera del rango, ajustamos rangos y grid
        if (currentPrice < lowerPrice || currentPrice > upperPrice) {
          this.logger.log(`Precio actual ${currentPrice} fuera del rango [${lowerPrice}, ${upperPrice}], ajustando grid...`);

          // Ajuste dinámico del rango para mantener el grid cerca del precio
          upperPrice = currentPrice * 1.002; // 0.2% arriba
          lowerPrice = currentPrice * 0.97;  // 3% abajo

          gridStep = (upperPrice - lowerPrice) / this.config.gridCount;

          // Cancela todas las órdenes abiertas y limpia mapa
          for (const [i, order] of this.openBuyOrders.entries()) {
            try {
              this.logger.log(`Cancelando orden ID: ${order.orderId} nivel ${i} para reajustar grid`);
              await this.binanceService.cancelOrder(this.symbol, order.orderId);
            } catch (e) {
              this.logger.error(`Error cancelando orden ID ${order.orderId}: ${e.message || e}`);
            }
          }
          this.openBuyOrders.clear();

          // Recolocar órdenes con nuevo rango
          await placeBuyOrders();
        }

        // Revisar estado de órdenes abiertas para detectar completadas o "atascadas"
        for (const [i, order] of Array.from(this.openBuyOrders.entries())) {
          const statusData = await this.binanceService.checkOrderStatus(this.symbol, order.orderId);

          // Si la orden fue llenada, colocar automáticamente orden de venta con profit margin
          if (statusData.status === 'FILLED') {
            this.logger.log(`Orden BUY nivel ${i} completada ID: ${order.orderId}`);
            this.openBuyOrders.delete(i);

            const sellPriceRaw = parseFloat(order.price) * (1 + this.config.profitMargin);
            const sellPrice = this.ajustarAlStep(sellPriceRaw, priceFilter.tickSize);
            const quantity = order.origQty;

            try {
              const sellOrder = await this.binanceService.createLimitOrder(
                this.symbol,
                'SELL',
                quantity,
                sellPrice,
                'GTC'
              );
              this.logger.log(`Orden SELL creada ID: ${sellOrder.orderId} en nivel ${i}`);
              this.logger.log(`PPrecio de venta ${sellPrice} en nivel ${i}`);

            } catch (err) {
              this.logger.error(`Error creando orden SELL nivel ${i}: ${err.message || err}`);
            }
          }

          // Si la orden lleva mucho tiempo sin llenarse (orden estancada), la cancelamos para liberar capital
          const maxAgeMs = this.config.maxOrderAgeMs || 3600000; // 1 hora por defecto
          if (Date.now() - order.timestamp > maxAgeMs) {
            this.logger.log(`Orden ID ${order.orderId} nivel ${i} está estancada, cancelando...`);
            try {
              await this.binanceService.cancelOrder(this.symbol, order.orderId);
              this.openBuyOrders.delete(i);

              // Colocar nuevamente orden en ese nivel para no perder la posición en la grilla
              await placeBuyOrders();
            } catch (e) {
              this.logger.error(`Error cancelando orden estancada ID ${order.orderId}: ${e.message || e}`);
            }
          }
        }

        await this.sleep(15000);
      } catch (err) {
        this.logger.error('Error en ciclo de monitoreo Grid Buy:', err);
        await this.sleep(30000);
      }
    }
  }

  private ajustarAlStep(value: number, step: string): string {
    const stepFloat = parseFloat(step);
    const precision = (step.split('.')[1] || '').length;
    const adjusted = Math.floor(value / stepFloat) * stepFloat;
    return adjusted.toFixed(precision);
  }

  private sleep(ms: number) {
    return new Promise(res => setTimeout(res, ms));
  }
}
