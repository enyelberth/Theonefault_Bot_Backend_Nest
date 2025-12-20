import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import axios from 'axios';

interface Grid {
  level: number;
  orderId?: number;
  active: boolean;
}

@Injectable()
export class PruebaService {
  private readonly logger = new Logger(PruebaService.name);

  private name:string;
  private seconName:string;
  private age:number;


  public Greed(){

  }


@Interval(6000)
async fetchAndSaveBtcPrice() {
  /*
  try {
  //  const price = await this.getBtcPriceFromApi();
  //  await this.savePriceToDatabase(price);
  //  this.logger.log(`Precio BTC obtenido: ${price}`);

    try {
  //   await this.binanceService.getServerTime();
   //   const saldos = await this.binanceService.getAccountBalance()
   //   this.logger.log('Saldos activos Binance:', saldos);
    } catch (error) {
      this.logger.error('Error obteniendo saldos de Binance', error);
    }

    if (this.grids.length === 0) {
      // await this.createGrids(price);
    }

    // await this.manageGrids(price);

  } catch (error) {
    this.logger.error('Error obteniendo el precio BTC', error);
  }*/
}


 
}
