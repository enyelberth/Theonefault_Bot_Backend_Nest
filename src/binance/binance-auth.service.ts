import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import * as https from 'https';
import { StrategyRuntimeContextService } from '../strategy-monitoring/strategy-runtime-context.service';
import {
  BinanceErrorHandler,
  BinanceApiError,
  RetryConfig,
} from './binance-error.utils';

/**
 * Handles all Binance API authentication and HTTP requests.
 *
 * Responsibilities:
 * - HMAC SHA256 signing for authenticated requests
 * - Server time synchronization with Binance
 * - HTTP request execution with error handling and retries
 * - Strategy context management
 *
 * All API requests automatically include:
 * - X-MBX-APIKEY header
 * - Timestamp (synced with server)
 * - Signature (HMAC SHA256)
 * - RecvWindow parameter for time tolerance
 *
 * @example
 * const authService = container.get(BinanceAuthService);
 * const accountInfo = await authService.getSigned('/api/v3/account', {});
 */
@Injectable()
export class BinanceAuthService {
  private readonly logger = new Logger(BinanceAuthService.name);
  private readonly API_KEY: string;
  private readonly API_SECRET: string;
  private readonly httpsAgent: https.Agent;
  private readonly isProduction: boolean;
  private readonly enableMarginInDev: boolean;
  private readonly errorHandler: BinanceErrorHandler;
  private readonly retryConfig: RetryConfig;
  private timeOffset = 0;

  constructor(
    private readonly strategyRuntimeContext: StrategyRuntimeContextService,
  ) {
    this.API_KEY = process.env.BINANCE_API_KEY || '';
    this.API_SECRET = process.env.BINANCE_API_SECRET || '';
    this.isProduction = process.env.NODE_ENV === 'production';
    this.enableMarginInDev =
      (process.env.ENABLE_MARGIN_IN_DEV || 'false').toLowerCase() === 'true';
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: this.isProduction, // ⚠️ Only allow in production
    });
    this.errorHandler = new BinanceErrorHandler();
    this.retryConfig = {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
    };
  }

  /**
   * Check if margin trading is enabled
   * @returns true if in production or ENABLE_MARGIN_IN_DEV=true
   */
  canUseMargin(): boolean {
    return this.isProduction || this.enableMarginInDev;
  }

  /**
   * Generate HMAC SHA256 signature for signed request
   * @param querystring URL query string to sign
   * @returns Hex-encoded HMAC SHA256 signature
   */
  sign(querystring: string): string {
    return crypto
      .createHmac('sha256', this.API_SECRET)
      .update(querystring)
      .digest('hex');
  }

  /**
   * Get current runtime context from strategy monitoring
   * @returns Current strategy execution context or null
   */
  getContext() {
    return this.strategyRuntimeContext.getContext();
  }

  async getServerTime(): Promise<number> {
    return this.errorHandler.withRetry(
      async () => {
        const url = `${process.env.BASE_URL}/api/v3/time`;
        try {
          const response = await axios.get(url, {
            httpsAgent: this.httpsAgent,
            timeout: 5000,
          });
          const serverTime = response.data.serverTime;

          if (this.timeOffset === 0) {
            this.timeOffset = serverTime - Date.now();
          }

          return serverTime;
        } catch (error) {
          throw this.normalizeError(error);
        }
      },
      { service: 'BinanceAuthService', operation: 'getServerTime' },
      this.retryConfig,
    );
  }

  async postSigned(endpoint: string, params: Record<string, string | number>) {
    return this.errorHandler.withRetry(
      async () => {
        try {
          const serverTime = await this.getServerTime();
          const allParams = {
            ...params,
            timestamp: serverTime,
            recvWindow: 30000,
          };

          const query = new URLSearchParams();
          Object.entries(allParams).forEach(([key, val]) =>
            query.append(key, val.toString()),
          );
          const queryString = query.toString();

          const signature = this.sign(queryString);
          const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

          this.logger.debug(`POST ${endpoint}`, {
            paramsCount: Object.keys(params).length,
          });

          const response = await axios.post(url, null, {
            headers: { 'X-MBX-APIKEY': this.API_KEY },
            httpsAgent: this.httpsAgent,
            timeout: 10000,
          });

          return response.data;
        } catch (error) {
          throw this.normalizeError(error);
        }
      },
      {
        service: 'BinanceAuthService',
        operation: `postSigned(${endpoint})`,
        params,
      },
      this.retryConfig,
    );
  }

  async getSigned(endpoint: string, params: Record<string, string | number>) {
    return this.errorHandler.withRetry(
      async () => {
        try {
          const serverTime = await this.getServerTime();
          const allParams = {
            ...params,
            timestamp: serverTime,
            recvWindow: 10000,
          };

          const query = new URLSearchParams();
          Object.entries(allParams).forEach(([key, val]) =>
            query.append(key, val.toString()),
          );
          const queryString = query.toString();

          const signature = this.sign(queryString);
          const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

          this.logger.debug(`GET ${endpoint}`, {
            paramsCount: Object.keys(params).length,
          });

          const response = await axios.get(url, {
            headers: { 'X-MBX-APIKEY': this.API_KEY },
            httpsAgent: this.httpsAgent,
            timeout: 10000,
          });

          return response.data;
        } catch (error) {
          throw this.normalizeError(error);
        }
      },
      {
        service: 'BinanceAuthService',
        operation: `getSigned(${endpoint})`,
        params,
      },
      this.retryConfig,
    );
  }

  async getSignedRequest(
    endpoint: string,
    params: Record<string, string | number>,
  ) {
    return this.errorHandler.withRetry(
      async () => {
        try {
          const serverTime = await this.getServerTime();
          const allParams = { ...params, timestamp: serverTime };

          const query = new URLSearchParams();
          Object.entries(allParams).forEach(([key, val]) =>
            query.append(key, val.toString()),
          );
          const queryString = query.toString();

          const signature = this.sign(queryString);
          const url = `${process.env.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

          const response = await axios.get(url, {
            headers: { 'X-MBX-APIKEY': this.API_KEY },
            httpsAgent: this.httpsAgent,
            timeout: 10000,
          });

          return response.data;
        } catch (error) {
          throw this.normalizeError(error);
        }
      },
      {
        service: 'BinanceAuthService',
        operation: `getSignedRequest(${endpoint})`,
        params,
      },
      this.retryConfig,
    );
  }

  /**
   * Normalize axios error to BinanceApiError
   */
  private normalizeError(error: any): BinanceApiError {
    const statusCode = error.response?.status;
    const binanceCode = error.response?.data?.code;
    const message =
      error.response?.data?.msg || error.message || 'Unknown error';
    return new BinanceApiError(statusCode, binanceCode, message);
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
