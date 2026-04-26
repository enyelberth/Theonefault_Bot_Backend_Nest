import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import * as https from 'https';
import { StrategyRuntimeContextService } from 'src/strategy-monitoring/strategy-runtime-context.service';

@Injectable()
export class BinanceAuthService {
  private readonly logger = new Logger(BinanceAuthService.name);
  private readonly API_KEY: string;
  private readonly API_SECRET: string;
  private readonly httpsAgent: https.Agent;
  private readonly isProduction: boolean;
  private readonly enableMarginInDev: boolean;
  private timeOffset = 0; // Desfase de timestamp con el servidor Binance

  constructor(private readonly strategyRuntimeContext: StrategyRuntimeContextService) {
    this.API_KEY = process.env.BINANCE_API_KEY || '';
    this.API_SECRET = process.env.BINANCE_API_SECRET || '';
    this.isProduction = process.env.NODE_ENV === 'production';
    this.enableMarginInDev = (process.env.ENABLE_MARGIN_IN_DEV || 'false').toLowerCase() === 'true';
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false, // ⚠️ Solo para desarrollo - no usar en producción
    });
  }

  canUseMargin(): boolean {
    return this.isProduction || this.enableMarginInDev;
  }

  sign(querystring: string): string {
    return crypto.createHmac('sha256', this.API_SECRET)
      .update(querystring)
      .digest('hex');
  }

  getContext() {
    return this.strategyRuntimeContext.getContext();
  }

  async getServerTime(): Promise<number> {
    const url = `${process.env.BASE_URL}/api/v3/time`;
    const response = await axios.get(url, { httpsAgent: this.httpsAgent });
    const serverTime = response.data.serverTime;

    // Calcula el desfase una sola vez y lo guarda para futuras llamadas
    if (this.timeOffset === 0) {
      this.timeOffset = serverTime - Date.now();
    }

    return serverTime;
  }

  async postSigned(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 30000 };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getSigned(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 10000 };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getSignedRequest(endpoint: string, params: Record<string, string | number>) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) => query.append(key, val.toString()));
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  getHttpsAgent() {
    return this.httpsAgent;
  }

  getApiKey(): string {
    return this.API_KEY;
  }

  getBaseUrl(): string {
    return process.env.BASE_URL || '';
  }

  firmar(): void {
    // Stub público mantenido por compatibilidad
  }
}
