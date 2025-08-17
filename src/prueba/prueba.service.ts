import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';
import { TradingService } from 'src/trading/trading.service';
import { CreateTradingOrderDto } from 'src/trading/dto/create-tradingOrder.dto';
import { OrderStatus } from '@prisma/client';

interface Grid {
  level: number;
  orderId?: number;
  active: boolean;
}

@Injectable()
export class PruebaService {
  private readonly logger = new Logger(PruebaService.name);

  private grids: Grid[] = [];
  private gridCount = 5;         // Cantidad de grids deseados
  private gridSpacing = 0.5;     // Espacio entre grids en precio

  constructor(
    private readonly cryptoPriceService: CryptoPriceService,
    private readonly trading: TradingService,
  ) {}

  @Interval(2000)
  async fetchAndSaveBtcPrice() {
    try {
      const price = await this.getBtcPriceFromApi();
      await this.savePriceToDatabase(price);

      if (this.grids.length === 0) {
        await this.createGrids(price);
      }

      await this.manageGrids(price);

    //  this.logger.log(`Precio BTC a los ${new Date().toLocaleTimeString()}: $${price}`);
    } catch (error) {
      this.logger.error('Error obteniendo el precio BTC', error);
    }
  }

  private async createGrids(currentPrice: number) {
    this.grids = [];
    console.log(currentPrice);
    // Ajuste para que el precio BUY LIMIT sea al menos 0.08% menor que currentPrice
    const minBuyPrice = currentPrice * (1 - this.trading['priceMargin']);
    for (let i = 0; i < this.gridCount; i++) {
      // Comenzar en minBuyPrice y bajar por gridSpacing
      const level = minBuyPrice - i * this.gridSpacing;
      console.log(level);
      const createOrderDto: CreateTradingOrderDto = {
        accountId: 2,           // Ajusta el ID de cuenta real aquí
        tradingPairId: 1,       // Ajusta el ID del par de trading aquí
        orderType: 'LIMIT',
        side: 'BUY',
        price: level,
        quantity: 1,
        quantityRemaining: 1,
        status: 'OPEN',
      };
      try {
        const order = await this.trading.createTradingOrder(createOrderDto, currentPrice);
        this.grids.push({ level, orderId: order.id, active: true });
        this.logger.log(`Grid creado en nivel ${level} con orden ID ${order.id}`);
      } catch (e) {
        this.logger.error(`Error creando orden en grid nivel ${level}`, e);
      }
    }
  }

  private async manageGrids(currentPrice: number) {
    for (const grid of this.grids) {
      if (!grid.active || !grid.orderId) continue;
      try {
        const order = await this.trading.findOneTradingOrder(grid.orderId);
        if (!order) {
          this.logger.warn(`Orden ${grid.orderId} no encontrada para grid ${grid.level}`);
          grid.active = false;
          continue;
        }
        if (order.status === OrderStatus.FILLED) {
          this.logger.log(`Orden ${grid.orderId} llenada. Creando orden de venta contraparte.`);
          const sellPrice = grid.level * (1 + this.trading['sellPriceMargin']);
          const createSellOrderDto: CreateTradingOrderDto = {
            accountId: order.accountId,
            tradingPairId: order.tradingPairId,
            orderType: order.orderType,
            side: 'SELL',
            price: order.price ? order.price.toNumber() : sellPrice,
            quantity: order.quantity.toNumber(),
            quantityRemaining: order.quantity.toNumber(),
            status: 'OPEN',
          };
          await this.trading.createTradingOrder(createSellOrderDto, currentPrice);
          grid.active = false;
          this.logger.log(`Orden venta creada para grid nivel ${grid.level} a precio ${sellPrice}`);
        } else if (order.status === OrderStatus.CANCELED) {
          this.logger.log(`Orden ${grid.orderId} cancelada, volviendo a crear orden.`);
          const createOrderDto: CreateTradingOrderDto = {
            accountId: order.accountId,
            tradingPairId: order.tradingPairId,
            orderType: order.orderType,
            side: order.side,
            price: order.price ? order.price.toNumber() : undefined,
            quantity: order.quantity.toNumber(),
            quantityRemaining: order.quantity.toNumber(),
            status: 'OPEN',
          };
          const newOrder = await this.trading.createTradingOrder(createOrderDto, currentPrice);
          grid.orderId = newOrder.id;
          grid.active = true;
          this.logger.log(`Nueva orden creada con ID ${newOrder.id} para grid nivel ${grid.level}`);
        }
      } catch (e) {
        this.logger.error(`Error gestionando grid en nivel ${grid.level}`, e);
      }
    }
  }

  private async getBtcPriceFromApi(): Promise<number> {
    const url = 'https://api.binance.com/api/v3/ticker/price?symbol=LINKFDUSD';
    const response = await axios.get(url);
    const price = parseFloat(response.data.price);
    if (isNaN(price)) throw new Error('Precio inválido recibido');
    return price;
  }

  private async savePriceToDatabase(price: number) {
    await this.cryptoPriceService.createPrueba(price, 1);
  }
}
