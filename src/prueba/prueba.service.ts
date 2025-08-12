import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';

@Injectable()
export class PruebaService {
  private readonly logger = new Logger(PruebaService.name);
  constructor(private readonly cryptoPriceService: CryptoPriceService) {}

  @Interval(60000) // Ejecuta cada 1 segundo (1000 ms)
  async fetchAndSaveBtcPrice() {
    try {
      const price = await this.getBtcPriceFromApi();

      // Aquí puedes guardar el precio en la base de datos
      await this.savePriceToDatabase(price);

      // Imprime mensaje en consola con el precio y timestamp
      this.logger.log(`Precio BTC a los ${new Date().toLocaleTimeString()}: $${price}`);
    } catch (error) {
      this.logger.error('Error obteniendo el precio BTC', error);
    }
  }

  private async getBtcPriceFromApi(): Promise<number> {
    const url = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCFDUSD';
    const response = await axios.get(url);
    const priceStr = response.data.price;
    const price = parseFloat(priceStr);
    if (isNaN(price)) {
      throw new Error('Precio recibido no es un número válido');
    }
    return price;
  }

  private async savePriceToDatabase(price: number) {
    console.log(price);
    await this.cryptoPriceService.createPrueba(price, 1);
    console.log(`Guardando precio BTC: $${price}`);
    // Aquí implementa la lógica para guardar en base de datos
  }
}
