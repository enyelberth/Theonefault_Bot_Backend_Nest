import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';

@Injectable()
export class BinanceService {
  private readonly API_KEY: string;
  private readonly API_SECRET: string;

  constructor() {
    this.API_KEY = process.env.BINANCE_API_KEY || '';
    this.API_SECRET = process.env.BINANCE_API_SECRET || '';
  }

  sign(querystring: string): string {
    return crypto.createHmac('sha256', this.API_SECRET)
      .update(querystring)
      .digest('hex');
  }

  async postSigned(endpoint: string, params: Record<string, string | number>) {
    const timestamp = Date.now().toString();
    const allParams = { ...params, timestamp };

    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(allParams)) {
      query.append(key, val.toString());
    }
    const queryString = query.toString();

    // Generar firma (await no es necesario, es función síncrona)
    const signature = this.sign(queryString);

    // Construir URL con query y firma
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    return axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
    });
  }

  async getSigned(endpoint: string, params: Record<string, string | number>) {
    const timestamp = Date.now().toString();
    const allParams = { ...params, timestamp };

    const query = new URLSearchParams();
    for (const [key, val] of Object.entries(allParams)) {
      query.append(key, val.toString());
    }
    const queryString = query.toString();

    const signature = this.sign(queryString);

    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    return axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
    });
  }
  async checkOrderStatus(symbol: string, orderId: number) {
    // const timestamp = Date.now().toString();  
    // const query = new URLSearchParams({ symbol, orderId: orderId.toString(), timestamp });
    // const signature = this.getSigned('/sapi/v1/margin/order',query);
    // const url = `${process.env.BASE_URL}/api/v3/order?${query.toString()}&signature=${signature}`;
    // const response = await axios.get(url, {
    //   headers: { 'X-MBX-APIKEY': this.API_KEY },
    // });


    // return response.data;
  }

  async getAccountBalance() {
    const timestamp = Date.now().toString();
    const query = new URLSearchParams({ timestamp });
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
    });

    // La propiedad correcta es "balances" (un arreglo)
    return response.data.balances;
  }
  async getAccountBalanceMarginIsolated(){
    const timestamp = Date.now().toString();
    const query = new URLSearchParams({ timestamp });
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/isolated/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
    });

    // La propiedad correcta es "assets" (un arreglo)
    return response.data.assets;
  }
  async listarSaldos() {
  const balances = await this.getAccountBalance();

  // Filtramos para mostrar solo balances con cantidad > 0
  const saldosNoNulos = balances.filter(
    (balance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0,
  );

  console.log('Saldos con saldo activo:');
  saldosNoNulos.forEach((balance) => {
    console.log(`${balance.asset}: Libre=${balance.free}, Bloqueado=${balance.locked}`);
  });

  return saldosNoNulos;
}


  // Función async para esperar a getAccountBalance()
  async firmar() {
   // const timestamp = new Date().toISOString();
   // console.log(this.API_KEY);

    // Esperamos la promesa y mostramos resultado
   // const balances = await this.getAccountBalance();
   // const saldos = await this.listarSaldos();
   // const margin = await this.getAccountBalanceMarginIsolated();
   // console.log(margin);

   // return `Firmado con API_KEY: ${this.API_KEY} y timestamp: ${timestamp}`;
  }
}
