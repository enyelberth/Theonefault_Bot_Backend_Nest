import { CreateCryptoPriceDto } from './dto/create-crypto-price.dto';
import { UpdateCryptoPriceDto } from './dto/update-crypto-price.dto';
import { PrismaClient } from '@prisma/client';

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
@Injectable()
export class CryptoPriceService {
    private readonly logger = new Logger(CryptoPriceService.name);
  private readonly apiUrl = 'https://api.binance.com/api/v3';
    private readonly symbols = ['BTCFDUSD', 'BNBFDUSD','ETHFDUSD','LINKFDUSD', 'XRPFDUSD','DOGEFDUSD','SOLFDUSD',];
  constructor(private readonly prisma: PrismaClient) {
  }
  create(createCryptoPriceDto: CreateCryptoPriceDto) {
    /*
    console.log("hola");
    console.log(createCryptoPriceDto);
    return this.prisma.cryptoPrice.create({
      data: createCryptoPriceDto,
    });
    */
  }
   async createPrueba(price: number, pairId: number){
  /*
    console.log("hola");
    return this.prisma.cryptoPrice.create({
      data: {
        price: price,
        pairId: pairId,
      },
    });*/
  }
  

  async findAll(): Promise<{ symbol: string; price: number }[]> {
    try {
      // Convierte los símbolos a un array JSON como string
      const symbolsParam = JSON.stringify(this.symbols.map(s => s.toUpperCase()));

      const response = await axios.get(`${this.apiUrl}/ticker/price`, {
        params: { symbols: symbolsParam },
      });

      // Binance responde con un array con objetos {symbol, price}
      const prices = response.data.map(item => ({
        symbol: item.symbol,
        price: parseFloat(item.price),
      }));

      this.logger.log(`Precios obtenidos para símbolos: ${this.symbols.join(', ')}`);
      return prices;

    } catch (error) {
      this.logger.error('Error obteniendo precios múltiple de crypto', error);
      return [];
    }
  }
  async findOne(symbol: string): Promise<number | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/ticker/price`, {
        params: { symbol: symbol.toUpperCase() },
      });
      const price = parseFloat(response.data.price);
      this.logger.log(`Precio de ${symbol}: $${price}`);
      return price;
    } catch (error) {
      this.logger.error(`Error obteniendo precio para simbolo ${symbol}`, error);
      return null;
    }
  }

  update(id: number, updateCryptoPriceDto: UpdateCryptoPriceDto) {
    /*
    return this.prisma.cryptoPrice.update({
      where: { id },
      data: updateCryptoPriceDto,
    });
    */
  }

  remove(id: number) {
    /*
    return this.prisma.cryptoPrice.delete({
      where: { id },
    });
    */
  }
    
}
