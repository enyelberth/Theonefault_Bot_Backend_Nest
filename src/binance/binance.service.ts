import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import * as https from 'https';

@Injectable()
export class BinanceService {
  private readonly API_KEY: string;
  private readonly API_SECRET: string;
  private readonly httpsAgent: https.Agent;

  constructor() {
    this.API_KEY = process.env.BINANCE_API_KEY || '';
    this.API_SECRET = process.env.BINANCE_API_SECRET || '';
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // ⚠️ Solo para desarrollo - no usar en producción
    });
  }

  sign(querystring: string): string {
    return crypto.createHmac('sha256', this.API_SECRET)
      .update(querystring)
      .digest('hex');
  }

  // Obtener tiempo del servidor Binance para sincronizar timestamp
  async getServerTime(): Promise<number> {
    const url = `${process.env.BASE_URL}/api/v3/time`;
    const response = await axios.get(url, { httpsAgent: this.httpsAgent });
    return response.data.serverTime;
  }

  async postSigned(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    return axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });
  }

  async getSigned(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    return axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });
  }

  async checkOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = { symbol, orderId, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getAccountBalance() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data.balances;
  }

  async getAccountBalanceMarginIsolated() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}/sapi/v1/margin/isolated/account?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data.assets;
  }

  async listarSaldos() {
    const balances = await this.getAccountBalance();

    const saldosNoNulos = balances.filter(
      (balance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0,
    );

    console.log('Saldos con saldo activo:');
    saldosNoNulos.forEach((balance) => {
      console.log(`${balance.asset}: Libre=${balance.free}, Bloqueado=${balance.locked}`);
    });

    return saldosNoNulos;
  }

  async firmar() {
    // Función ejemplo para pruebas
  }
}
