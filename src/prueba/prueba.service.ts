import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';
import { TradingService } from 'src/trading/trading.service';
import { CreateTradingOrderDto } from 'src/trading/dto/create-tradingOrder.dto';
import { OrderStatus } from '@prisma/client';
import { BinanceService } from 'src/binance/binance.service';

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
    private readonly binanceService: BinanceService,
    private readonly trading: TradingService,
  ) {}

@Interval(6000)
async fetchAndSaveBtcPrice() {
  try {
    const price = await this.getBtcPriceFromApi();
    await this.savePriceToDatabase(price);
    this.logger.log(`Precio BTC obtenido: ${price}`);

    try {
       await this.binanceService.getServerTime();
      const saldos = await this.binanceService.listarSaldos();
      this.logger.log('Saldos activos Binance:', saldos);
    } catch (error) {
      this.logger.error('Error obteniendo saldos de Binance', error);
    }

    if (this.grids.length === 0) {
      // await this.createGrids(price);
    }

    // await this.manageGrids(price);

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
