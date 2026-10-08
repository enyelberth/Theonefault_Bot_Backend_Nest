import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';
import axios from 'axios';
import * as https from 'https';
import { isNotEmptyObject } from 'class-validator';
import { CryptoPriceService } from 'src/crypto-price/crypto-price.service';
import { envConfig } from '../config/env.config';

@Injectable()
export class BinanceService implements OnModuleInit {
  private readonly API_KEY: string;
  private readonly API_SECRET: string;
  private readonly BASE_URL: string;
  private readonly MARGIN_ENABLED: boolean;
  private readonly PRODUCTION: boolean;
  private readonly httpsAgent: https.Agent;
  private readonly AUTO_BNB_BURN: boolean;
  private readonly BNB_LOW_THRESHOLD: number;
  // Request a Binance sin timeout podía colgar el tick del runner
  // indefinidamente (nada más lo frenaba). 15s cubre con margen un
  // round-trip normal incluso bajo latencia alta.
  private readonly HTTP_TIMEOUT_MS = 15_000;
  private readonly http: ReturnType<typeof axios.create>;

  // Cached delta: server epoch (ms) - local epoch (ms).
  private timeOffsetMs: number = 0;
  private lastSyncAt: number = 0;
  private readonly SYNC_TTL_MS = 60 * 1000; // resync cada 1 min (era 5 min)
  private readonly TIMESTAMP_SAFETY_MS = 5000; // envía timestamp N ms detrás del server
  private syncing: Promise<void> | null = null;

  constructor() {
    const cfg = envConfig();
    this.API_KEY = cfg.binance.apiKey;
    this.API_SECRET = cfg.binance.apiSecret;
    this.BASE_URL = cfg.binance.baseUrl;
    this.MARGIN_ENABLED = cfg.marginEnabled;
    this.PRODUCTION = cfg.production;
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: cfg.production,
      keepAlive: true,
      keepAliveMsecs: 30_000,
      maxSockets: 128,
    });
    this.http = axios.create({
      httpsAgent: this.httpsAgent,
      timeout: this.HTTP_TIMEOUT_MS,
    });
    this.AUTO_BNB_BURN = cfg.binance.autoEnableBnbBurn;
    this.BNB_LOW_THRESHOLD = cfg.binance.bnbLowBalanceThreshold;
    const keyPrefix = this.API_KEY
      ? this.API_KEY.slice(0, 8) + '...'
      : '(empty)';
    const secretPrefix = this.API_SECRET
      ? this.API_SECRET.slice(0, 4) + '...'
      : '(empty)';
    console.log(
      `[BinanceService] mode=${cfg.production ? 'PRODUCTION' : 'TEST'} baseUrl=${this.BASE_URL} margin=${this.MARGIN_ENABLED ? 'ON' : 'OFF'} apiKey=${keyPrefix} apiSecret=${secretPrefix} keyLen=${this.API_KEY.length} secretLen=${this.API_SECRET.length}`,
    );
  }

  getMode(): {
    mode: 'PRODUCTION' | 'TEST';
    baseUrl: string;
    marginEnabled: boolean;
    apiKeyPrefix: string;
  } {
    return {
      mode: this.PRODUCTION ? 'PRODUCTION' : 'TEST',
      baseUrl: this.BASE_URL,
      marginEnabled: this.MARGIN_ENABLED,
      apiKeyPrefix: this.API_KEY ? this.API_KEY.slice(0, 6) + '...' : '(empty)',
    };
  }

  async pingSigned(): Promise<{
    ok: boolean;
    canTrade?: boolean;
    accountType?: string;
    error?: string;
  }> {
    try {
      const info = await this.getAccountInfo();
      return {
        ok: true,
        canTrade: info.canTrade,
        accountType: info.accountType,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.response?.data?.msg ?? err?.message ?? 'unknown',
      };
    }
  }

  private ensureMarginEnabled(): void {
    if (!this.MARGIN_ENABLED) {
      throw new ForbiddenException(
        'Margin disabled. Set MARGIN=true in .env to enable margin endpoints.',
      );
    }
    if (!this.PRODUCTION) {
      throw new ForbiddenException(
        'Margin endpoints not available on testnet (testnet.binance.vision does not expose /sapi/v1/margin/*). Set PRODUCTION=true and provide production API keys.',
      );
    }
  }

  async onModuleInit() {
    try {
      await this.syncTime();
    } catch (err) {
      console.warn('Initial Binance time sync failed:', (err as Error).message);
    }
    await this.ensureBnbBurnEnabled().catch((err) => {
      console.warn(
        '[BinanceService] BNB burn setup skipped:',
        (err as Error).message,
      );
    });
  }

  private async ensureBnbBurnEnabled(): Promise<void> {
    if (!this.API_KEY || !this.API_SECRET) return;
    const status = await this.getBnbBurnStatus();
    if (!status.spotBNBBurn || !status.interestBNBBurn) {
      if (this.AUTO_BNB_BURN) {
        try {
          const updated = await this.setBnbBurn(true, true);
          console.log(
            `[BinanceService] BNB burn enabled spot=${updated.spotBNBBurn} interest=${updated.interestBNBBurn}`,
          );
        } catch (err: any) {
          console.warn(
            `[BinanceService] failed to enable BNB burn: ${err?.response?.data?.msg ?? err.message}`,
          );
        }
      } else {
        console.warn(
          `[BinanceService] BNB burn disabled (spot=${status.spotBNBBurn} interest=${status.interestBNBBurn}). Fees paying full price. Set BINANCE_AUTO_BNB_BURN=true or enable manually.`,
        );
      }
    } else {
      console.log('[BinanceService] BNB fee burn active (spot + interest).');
    }
    try {
      const balance = await this.getBnbBalance();
      if (balance.total < this.BNB_LOW_THRESHOLD) {
        console.warn(
          `[BinanceService] Low BNB balance: ${balance.total} < ${this.BNB_LOW_THRESHOLD}. Fees will fall back to full price. Top up BNB.`,
        );
      }
    } catch (err) {
      console.warn(
        '[BinanceService] could not read BNB balance:',
        (err as Error).message,
      );
    }
  }

  sign(querystring: string): string {
    return crypto
      .createHmac('sha256', this.API_SECRET)
      .update(querystring)
      .digest('hex');
  }

  private async syncTime(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      try {
        const url = `${this.BASE_URL}/api/v3/time`;
        const localBefore = Date.now();
        const response = await this.http.get(url, { httpsAgent: this.httpsAgent });
        const localAfter = Date.now();
        const rtt = localAfter - localBefore;
        // ajuste: serverTime midió cerca del punto medio del rtt
        this.timeOffsetMs = Math.round(
          response.data.serverTime - (localBefore + rtt / 2),
        );
        this.lastSyncAt = localAfter;
        const drift = Math.abs(this.timeOffsetMs);
        if (drift > 500 || rtt > 800) {
          console.log(
            `\x1b[33m[Binance]\x1b[0m time sync drift=\x1b[1m${this.timeOffsetMs}ms\x1b[0m rtt=${rtt}ms`,
          );
        }
      } finally {
        this.syncing = null;
      }
    })();
    return this.syncing;
  }

  /**
   * Timestamp para firmar. Usa reloj local + offset (cached).
   * Resync cada SYNC_TTL_MS o si nunca sincronizó.
   */
  async getServerTime(): Promise<number> {
    if (
      this.lastSyncAt === 0 ||
      Date.now() - this.lastSyncAt > this.SYNC_TTL_MS
    ) {
      try {
        await this.syncTime();
      } catch (err) {
        console.warn(
          'syncTime failed, using local + last offset',
          (err as Error).message,
        );
      }
    }
    // Envía timestamp ligeramente atrasado para evitar "ahead of server's time"
    return Math.floor(
      Date.now() + this.timeOffsetMs - this.TIMESTAMP_SAFETY_MS,
    );
  }

  private isTimestampError(err: any): boolean {
    const code = err?.response?.data?.code;
    return code === -1021;
  }

  private isMarginEndpoint(endpoint: string): boolean {
    return endpoint.includes('/margin/');
  }

  async postSigned(
    endpoint: string,
    params: Record<string, string | number>,
  ): Promise<any> {
    if (this.isMarginEndpoint(endpoint)) this.ensureMarginEnabled();
    for (let attempt = 0; attempt < 2; attempt++) {
      const serverTime = await this.getServerTime();
      const allParams = { ...params, timestamp: serverTime, recvWindow: 60000 };

      const query = new URLSearchParams();
      Object.entries(allParams).forEach(([key, val]) =>
        query.append(key, val.toString()),
      );
      const queryString = query.toString();

      const signature = this.sign(queryString);
      const url = `${this.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

      try {
        const response = await this.http.post(url, null, {
          headers: { 'X-MBX-APIKEY': this.API_KEY },
          httpsAgent: this.httpsAgent,
        });
        return response.data;
      } catch (err) {
        if (attempt === 0 && this.isTimestampError(err)) {
          console.warn(
            'Binance -1021 detected. Forcing time resync and retrying.',
          );
          this.lastSyncAt = 0;
          await this.syncTime().catch(() => {});
          continue;
        }
        throw err;
      }
    }
  }

  async getSigned(
    endpoint: string,
    params: Record<string, string | number>,
  ): Promise<any> {
    if (this.isMarginEndpoint(endpoint)) this.ensureMarginEnabled();
    for (let attempt = 0; attempt < 2; attempt++) {
      const serverTime = await this.getServerTime();
      const allParams = { ...params, timestamp: serverTime, recvWindow: 60000 };

      const query = new URLSearchParams();
      Object.entries(allParams).forEach(([key, val]) =>
        query.append(key, val.toString()),
      );
      const queryString = query.toString();

      const signature = this.sign(queryString);
      const url = `${this.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

      try {
        const response = await this.http.get(url, {
          headers: { 'X-MBX-APIKEY': this.API_KEY },
          httpsAgent: this.httpsAgent,
        });
        return response.data;
      } catch (err) {
        if (attempt === 0 && this.isTimestampError(err)) {
          console.warn(
            'Binance -1021 detected. Forcing time resync and retrying.',
          );
          this.lastSyncAt = 0;
          await this.syncTime().catch(() => {});
          continue;
        }
        throw err;
      }
    }
  }
  //Create ordenes
  async createLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'LIMIT',
      quantity,
      price,
      timeInForce,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/api/v3/order', params);
  }

  async createMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'MARKET',
      quantity,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/api/v3/order', params);
  }

  async createLimitMakerOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'LIMIT_MAKER',
      quantity,
      price,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/api/v3/order', params);
  }
  async getSymbolTickSize(symbol: string): Promise<number> {
    const { priceFilter } = await this.obtenerFiltrosSimbolo(symbol);
    if (!priceFilter || !priceFilter.tickSize) {
      throw new Error(`No se pudo obtener tickSize para el símbolo ${symbol}`);
    }
    return parseFloat(priceFilter.tickSize);
  }

  async createOcoOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    stopPrice: string,
    stopLimitPrice: string,
    stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
  ) {
    const serverTime = await this.getServerTime();
    const allParams = {
      symbol,
      side,
      quantity,
      price,
      stopPrice,
      stopLimitPrice,
      stopLimitTimeInForce,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/order/oco?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async checkOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = {
      symbol,
      orderId,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async cancelOrder(symbol: string, orderId?: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = {
      symbol,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    // Si se pasa orderId cancela esa orden, sino cancela todas (opcional)
    if (orderId !== undefined) {
      params.orderId = orderId;
    }

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await this.http.delete(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  // Función para obtener precio de la crypto según el par (símbolo)
  async getSymbolPrice(symbol: string) {
    const params = { symbol };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const url = `${this.BASE_URL}/api/v3/ticker/price?${queryString}`;

    const response = await this.http.get(url, {
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getBookTicker(symbol: string) {
    const queryString = new URLSearchParams({ symbol }).toString();
    const url = `${this.BASE_URL}/api/v3/ticker/bookTicker?${queryString}`;
    const response = await this.http.get(url, { httpsAgent: this.httpsAgent });
    return response.data;
  }

  // Obtiene todos los precios (público, sin firma) para valorar cartera
  async getAllPrices(): Promise<Array<{ symbol: string; price: string }>> {
    const url = `${this.BASE_URL}/api/v3/ticker/price`;
    const response = await this.http.get(url, { httpsAgent: this.httpsAgent });
    return response.data;
  }

  /**
   * Devuelve balances spot no-cero valorados en USDT y el total de la cartera.
   * - Stablecoins (USDT/USDC/BUSD/FDUSD/TUSD/DAI/USDP) se cuentan 1:1.
   * - Otros activos: usa par ASSET+USDT si existe; si no, ASSET+BTC * BTCUSDT como fallback.
   * - Activos sin ruta a USDT quedan con usdtValue=0.
   */
  async getBalancesInUsdt(): Promise<{
    assets: Array<{
      asset: string;
      free: number;
      locked: number;
      total: number;
      priceUsdt: number;
      usdtValue: number;
    }>;
    totalUsdt: number;
  }> {
    const [balances, prices] = await Promise.all([
      this.getNonZeroBalances(),
      this.getAllPrices(),
    ]);

    const priceMap = new Map<string, number>();
    for (const p of prices) {
      const n = Number(p.price);
      if (Number.isFinite(n)) priceMap.set(p.symbol, n);
    }

    const STABLES = new Set([
      'USDT',
      'USDC',
      'BUSD',
      'FDUSD',
      'TUSD',
      'DAI',
      'USDP',
    ]);
    const btcUsdt = priceMap.get('BTCUSDT') ?? 0;

    const priceInUsdt = (asset: string): number => {
      if (STABLES.has(asset)) return 1;
      const direct = priceMap.get(`${asset}USDT`);
      if (direct) return direct;
      const viaBtc = priceMap.get(`${asset}BTC`);
      if (viaBtc && btcUsdt) return viaBtc * btcUsdt;
      return 0;
    };

    const assets = balances.map((b: any) => {
      const free = Number(b.free);
      const locked = Number(b.locked);
      const total = free + locked;
      const priceUsdt = priceInUsdt(b.asset);
      const usdtValue = total * priceUsdt;
      return { asset: b.asset, free, locked, total, priceUsdt, usdtValue };
    });

    assets.sort((a, b) => b.usdtValue - a.usdtValue);
    const totalUsdt = assets.reduce((sum, a) => sum + a.usdtValue, 0);

    return { assets, totalUsdt };
  }
  async obtenerFiltrosSimbolo(symbol: string) {
    const url = `${this.BASE_URL}/api/v3/exchangeInfo`;
    const response = await this.http.get(url, { httpsAgent: this.httpsAgent });

    const symbolInfo = response.data.symbols.find(
      (s: any) => s.symbol === symbol,
    );
    if (!symbolInfo) {
      throw new Error(`Símbolo ${symbol} no encontrado en exchangeInfo`);
    }

    const priceFilter = symbolInfo.filters.find(
      (f: any) => f.filterType === 'PRICE_FILTER',
    );
    const lotSizeFilter = symbolInfo.filters.find(
      (f: any) => f.filterType === 'LOT_SIZE',
    );

    return { priceFilter, lotSizeFilter };
  }
  // Saldo Spot (ya tienes función getAccountInfo que lo devuelve pero aquí es directo a balances)
  async getSpotBalances() {
    const accountInfo = await this.getAccountInfo();
    return accountInfo.balances.filter(
      (asset: any) =>
        parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0,
    );
  }

  // Saldo Margin Cruzado
  async getCrossMarginBalances() {
    const crossMarginInfo = await this.getCrossMarginAccountInfo();
    return crossMarginInfo.userAssets.filter(
      (asset: any) =>
        parseFloat(asset.free) > 0 ||
        parseFloat(asset.borrowed) > 0 ||
        parseFloat(asset.netAsset) > 0,
    );
  }
  async borrowCrossMargin(asset: string, amount: string) {
    const serverTime = await this.getServerTime();
    const params = { asset, amount, timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/loan?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async repayCrossMargin(asset: string, amount: string) {
    const serverTime = await this.getServerTime();
    const params = { asset, amount, timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/repay?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  // Saldo Margin Aislado
  async getIsolatedMarginBalances() {
    const isolatedMarginInfo = await this.getAccountBalanceMarginIsolated();
    // La función getAccountBalanceMarginIsolated ya devuelve las assets aisladas, puedes filtrar si quieres
    return isolatedMarginInfo.filter(
      (asset: any) =>
        (asset.baseAsset &&
          (parseFloat(asset.baseAsset.free) > 0 ||
            parseFloat(asset.baseAsset.locked) > 0)) ||
        (asset.quoteAsset &&
          (parseFloat(asset.quoteAsset.free) > 0 ||
            parseFloat(asset.quoteAsset.locked) > 0)),
    );
  }

  // Órdenes abiertas Spot (todos los símbolos)
  async getSpotOpenOrders() {
    return this.getSigned('/api/v3/openOrders', {});
  }

  // Órdenes abiertas Margin Cruzado (todos los símbolos)
  async getCrossMarginOpenOrders() {
    return this.getSigned('/sapi/v1/margin/openOrders', {});
  }

  // Órdenes abiertas Margin Aislado (requiere símbolo por par aislado)
  async getIsolatedMarginOpenOrdersForSymbols(symbols: string[]) {
    const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
    const results = await Promise.all(
      uniqueSymbols.map((symbol) =>
        this.getSigned('/sapi/v1/margin/openOrders', {
          symbol,
          isIsolated: 'TRUE',
        }).catch(() => []),
      ),
    );
    return results.flat();
  }

  // Cancelar una orden margin aislado
  async cancelIsolatedMarginOrder(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = {
      symbol,
      orderId,
      isIsolated: 'TRUE',
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await this.http.delete(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async transferBetweenSpotAndCrossMargin(
    asset: string,
    amount: string,
    type: 1 | 2,
  ) {
    const serverTime = await this.getServerTime();
    const params = {
      asset,
      amount,
      type,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/transfer?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  //Obtener saldos
  async getAllOrders(symbol: string, limit = 500, fromId?: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = {
      symbol,
      limit,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    if (fromId !== undefined) {
      params.fromId = fromId;
    }

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/allOrders?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async getAccountInfo() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getFullCrossMarginBalance() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };
    return this.getSigned('/sapi/v1/margin/account', params);
  }
  async getCrossMarginLoans() {
    const accountInfo = await this.getCrossMarginAccountInfo();
    //console.log(accountInfo)
    //const loans = accountInfo.userAssets.filter((asset: any) => parseFloat(asset.borrowed) > 0);
    return accountInfo;
  }

  async getCrossMarginAccountInfo() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    // CORRECCIÓN AQUÍ: Cambia api por sapi
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/account?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getNonZeroBalances() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/account?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    // Filtra activos con balance libre o bloqueado mayor que 0
    const balances = response.data.balances.filter(
      (asset: any) =>
        parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0,
    );

    return balances;
  }

  async getIsolatedMarginAccountInfo(symbol: string) {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000, symbol };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/api/v1/margin/isolated/account?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getFuturesAccountBalance() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/fapi/v2/balance?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async createStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {},
    clientOrderId?: string,
  ) {
    const serverTime = await this.getServerTime();
    const params = {
      symbol,
      side,
      type: 'STOP_LOSS_LIMIT',
      quantity,
      price: stopPrice,
      stopPrice,
      timeInForce: 'GTC',
      timestamp: serverTime,
      recvWindow: 60000,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
      ...options,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}/api/v3/order?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getCandles(
    symbol: string,
    interval: string,
    limit: number,
    startTime?: number,
    endTime?: number,
  ): Promise<
    {
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
      openTime: number;
      closeTime: number;
    }[]
  > {
    const params: Record<string, string | number> = { symbol, interval, limit };
    if (startTime !== undefined) params.startTime = startTime;
    if (endTime !== undefined) params.endTime = endTime;
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const url = `${this.BASE_URL}/api/v3/klines?${queryString}`;

    const response = await this.http.get(url, {
      httpsAgent: this.httpsAgent,
    });

    // El endpoint devuelve arrays por vela, con esta estructura:
    // [
    //   0 Open time,
    //   1 Open,
    //   2 High,
    //   3 Low,
    //   4 Close,
    //   5 Volume,
    //   6 Close time,
    //   ...
    // ]

    // Lo transformamos a objetos con propiedades explícitas
    return response.data.map((kline: any[]) => ({
      openTime: kline[0],
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
      closeTime: kline[6],
    }));
  }

  async cancelAllOrders(symbol: string) {
    try {
      // 1. Obtener todas las órdenes abiertas para el símbolo
      const serverTime = await this.getServerTime();
      const params = { symbol, timestamp: serverTime, recvWindow: 60000 };
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) =>
        query.append(key, val.toString()),
      );
      const queryString = query.toString();

      const signature = this.sign(queryString);
      const url = `${this.BASE_URL}/api/v3/openOrders?${queryString}&signature=${signature}`;

      const response = await this.http.get(url, {
        headers: { 'X-MBX-APIKEY': this.API_KEY },
        httpsAgent: this.httpsAgent,
      });

      const openOrders = response.data;

      // 2. Cancelar cada orden abierta
      const cancelPromises = openOrders.map((order: any) =>
        this.cancelOrder(symbol, order.orderId),
      );

      // Esperar a que se cancelen todas las órdenes
      await Promise.all(cancelPromises);

      return {
        message: `Se cancelaron ${openOrders.length} órdenes para el símbolo ${symbol}`,
        canceledOrdersCount: openOrders.length,
      };
    } catch (error) {
      throw new Error('Error cancelando todas las órdenes: ' + error.message);
    }
  }

  async getAccountBalancesAll() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/account?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async createCrossMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'LIMIT',
      quantity,
      price,
      timeInForce,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/sapi/v1/margin/order', params);
  }

  async createCrossMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'MARKET',
      quantity,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/sapi/v1/margin/order', params);
  }

  async createCrossMarginLimitMakerOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'LIMIT_MAKER',
      quantity,
      price,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/sapi/v1/margin/order', params);
  }

  async createIsolatedMarginLimitOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    timeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'LIMIT',
      quantity,
      price,
      timeInForce,
      isIsolated: 'TRUE',
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async createIsolatedMarginLimitMakerOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'LIMIT_MAKER',
      quantity,
      price,
      isIsolated: 'TRUE',
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async createIsolatedMarginMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    clientOrderId?: string,
  ) {
    const params = {
      symbol,
      side,
      type: 'MARKET',
      quantity,
      isIsolated: 'TRUE',
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
    };
    return this.postSigned('/sapi/v1/margin/isolated/order', params);
  }

  async getAccountBalanceMarginIsolated() {
    const serverTime = await this.getServerTime();
    const params = { timestamp: serverTime, recvWindow: 60000 };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/isolated/account?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data.assets;
  }
  // Obtener todas las órdenes abiertas en margin cruzado para un símbolo
  async getAllCrossMarginOrders(symbol: string, limit = 500, fromId?: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = {
      symbol,
      limit,
      timestamp: serverTime,
      recvWindow: 60000,
    };
    if (fromId !== undefined) params.fromId = fromId;

    return this.getSigned('/sapi/v1/margin/openOrders', params);
  }

  // Consultar una orden específica margin cruzado
  async getCrossMarginOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = {
      symbol,
      orderId,
      timestamp: serverTime,
      recvWindow: 60000,
    };
    return this.getSigned('/sapi/v1/margin/order', params);
  }

  // Cancelar todas las órdenes abiertas margin cruzado para un símbolo
  async cancelAllCrossMarginOrders(symbol: string) {
    try {
      const serverTime = await this.getServerTime();
      const params = { symbol, timestamp: serverTime, recvWindow: 60000 };
      const queryString = new URLSearchParams(params as any).toString();
      const signature = this.sign(queryString);
      this.ensureMarginEnabled();
      const url = `${this.BASE_URL}/sapi/v1/margin/openOrders?${queryString}&signature=${signature}`;
      const response = await this.http.get(url, {
        headers: { 'X-MBX-APIKEY': this.API_KEY },
        httpsAgent: this.httpsAgent,
      });
      const openOrders = response.data;
      // Cancelar cada orden
      const cancelPromises = openOrders.map((order: any) =>
        this.cancelCrossMarginOrder(symbol, order.orderId),
      );
      await Promise.all(cancelPromises);
      return {
        message: `Se cancelaron ${openOrders.length} órdenes de margin cruzado para el símbolo ${symbol}`,
        canceledOrdersCount: openOrders.length,
      };
    } catch (error) {
      throw new Error(
        'Error cancelando todas las órdenes de margin cruzado: ' +
          (error as Error).message,
      );
    }
  }

  // Función auxiliar para cancelar una orden margin cruzado

  async cancelCrossMarginOrder(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params: Record<string, string | number> = {
      symbol,
      orderId,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await this.http.delete(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async cancelAllCrossMarginOrdersBySide(symbol: string, side: 'BUY' | 'SELL') {
    try {
      const openOrders = await this.getAllCrossMarginOrders(symbol);
      const ordersToCancel = openOrders.filter((order) => order.side === side);

      if (ordersToCancel.length === 0) {
        return {
          message: `No hay órdenes abiertas para cancelar en ${symbol} del lado ${side}.`,
        };
      }

      let canceledCount = 0;
      let failedCount = 0;

      for (const order of ordersToCancel) {
        try {
          await this.cancelCrossMarginOrder(symbol, order.orderId);
          canceledCount++;
        } catch (error: any) {
          if (error.response?.status === 429) {
            const retryAfter = error.response.headers['retry-after'] || 5;
            console.warn(
              `Rate limit excedido. Esperando ${retryAfter} segundos antes de reintentar.`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, retryAfter * 1000),
            );
            // opcional: reintentar la cancelación después de esperar
            try {
              await this.cancelCrossMarginOrder(symbol, order.orderId);
              canceledCount++;
            } catch {
              failedCount++;
            }
          } else {
            failedCount++;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 200)); // pequeño delay para evitar ráfagas
      }

      return {
        message: `Se intentaron cancelar ${ordersToCancel.length} órdenes. Éxitos: ${canceledCount}, Fallos: ${failedCount}`,
        canceledOrdersCount: canceledCount,
        failedOrdersCount: failedCount,
      };
    } catch (error) {
      throw new Error(
        'Error cancelando órdenes margin cruzado por lado: ' +
          (error as Error).message,
      );
    }
  }

  async checkCrossMarginOrderStatus(symbol: string, orderId: number) {
    const serverTime = await this.getServerTime();
    const params = {
      symbol,
      orderId,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await this.http.get(url, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async createCrossMarginStopLossOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    stopPrice: string,
    options: Record<string, any> = {},
    clientOrderId?: string,
  ) {
    const serverTime = await this.getServerTime();
    const params = {
      symbol,
      side,
      type: 'STOP_LOSS_LIMIT',
      quantity,
      price: stopPrice,
      stopPrice,
      timeInForce: 'GTC',
      timestamp: serverTime,
      recvWindow: 60000,
      ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
      ...options,
    };

    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/order?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }

  async createCrossMarginOcoOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: string,
    price: string,
    stopPrice: string,
    stopLimitPrice: string,
    stopLimitTimeInForce: 'GTC' | 'IOC' | 'FOK' = 'GTC',
  ) {
    const serverTime = await this.getServerTime();
    const allParams = {
      symbol,
      side,
      quantity,
      price,
      stopPrice,
      stopLimitPrice,
      stopLimitTimeInForce,
      timestamp: serverTime,
      recvWindow: 60000,
    };

    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();

    const signature = this.sign(queryString);
    this.ensureMarginEnabled();
    const url = `${this.BASE_URL}/sapi/v1/margin/order/oco?${queryString}&signature=${signature}`;

    const response = await this.http.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    });

    return response.data;
  }
  async getCrossMarginPositions() {
    try {
      const response = await this.getSignedRequest(
        '/sapi/v1/margin/positionRisk',
        {},
        'GET',
      );
      console.debug('Respuesta getCrossMarginPositions:', response.data);
      if (!Array.isArray(response.data)) {
        throw new Error('La respuesta no es un array de posiciones');
      }
      return response.data;
    } catch (error) {
      throw new Error(
        `Error obteniendo posiciones margin cruzado: ${(error as Error).message}`,
      );
    }
  }

  async getCrossMarginPosition(symbol: string) {
    const positions = await this.getCrossMarginPositions();
    const position = positions.find((pos: any) => pos.symbol === symbol);
    if (!position) {
      throw new Error(`No hay posición abierta para el símbolo ${symbol}`);
    }
    return position;
  }

  async getCrossMarginUnrealizedProfit(symbol: string) {
    const position = await this.getCrossMarginPosition(symbol);
    return {
      symbol,
      positionAmt: position.positionAmt,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
      unRealizedProfit: parseFloat(position.unRealizedProfit),
    };
  }

  async getCrossMarginProfitPercent(symbol: string) {
    const { entryPrice, markPrice, positionAmt } =
      await this.getCrossMarginUnrealizedProfit(symbol);
    if (parseFloat(entryPrice) === 0) return 0;
    const profitPercent =
      ((parseFloat(markPrice) - parseFloat(entryPrice)) /
        parseFloat(entryPrice)) *
      100;
    return profitPercent * (parseFloat(positionAmt) >= 0 ? 1 : -1);
  }
  private async getSignedRequest(
    endpoint: string,
    params: Record<string, string | number>,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
  ) {
    const serverTime = await this.getServerTime();
    const allParams = { ...params, timestamp: serverTime, recvWindow: 60000 };
    const query = new URLSearchParams();
    Object.entries(allParams).forEach(([key, val]) =>
      query.append(key, val.toString()),
    );
    const queryString = query.toString();
    const signature = this.sign(queryString);
    const url = `${this.BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const config = {
      headers: { 'X-MBX-APIKEY': this.API_KEY },
      httpsAgent: this.httpsAgent,
    };

    if (method === 'GET') {
      return this.http.get(url, config);
    } else if (method === 'POST') {
      return this.http.post(url, null, config);
    } else if (method === 'DELETE') {
      return this.http.delete(url, config);
    } else {
      throw new Error(`Unsupported method ${method}`);
    }
  }
  async calculateCrossMarginSummary() {
    const accountInfo = await this.getCrossMarginAccountInfo();

    const marginLevel = parseFloat(accountInfo.marginLevel);
    const totalAsset = parseFloat(accountInfo.totalAssetOfBtc);
    const totalLiability = parseFloat(accountInfo.totalLiabilityOfBtc);
    const totalNetAsset = parseFloat(accountInfo.totalNetAssetOfBtc);

    // Ganancia / pérdida neta = total neto de activos
    const netProfitLoss = totalNetAsset;

    // Retornar resumen
    return {
      marginLevel,
      totalAsset,
      totalLiability,
      netProfitLoss,
      userAssets: accountInfo.userAssets.map((asset: any) => ({
        asset: asset.asset,
        free: parseFloat(asset.free),
        borrowed: parseFloat(asset.borrowed),
        interest: parseFloat(asset.interest),
        netAsset: parseFloat(asset.netAsset),
      })),
    };
  }

  // En su BinanceService.ts

  async getCrossMarginPNLSummary() {
    // Reutilizamos la función existente para obtener la información de la cuenta
    const accountInfo = await this.getCrossMarginAccountInfo();

    const marginLevel = parseFloat(accountInfo.marginLevel);
    const totalNetAssetOfBtc = parseFloat(accountInfo.totalNetAssetOfBtc);
    const totalLiabilityOfBtc = parseFloat(accountInfo.totalLiabilityOfBtc);

    const unrealizedPNL = totalNetAssetOfBtc;

    // 💡 CORRECCIÓN TS2454: Asignar un valor inicial por defecto.
    let liquidationStatus: string = 'Estado no determinado';
    let riskLevel:
      | 'BAJO'
      | 'MEDIO'
      | 'ALTO'
      | 'CRÍTICO'
      | 'LIQUIDACIÓN INMINENTE' = 'BAJO';

    // Los umbrales varían según la configuración de Binance. Usamos valores comunes:
    const WARNING_LEVEL = 1.5; // Nivel de Advertencia/Llamada de Margen inicial
    const CRITICAL_LEVEL = 1.1; // Nivel donde la liquidación es cercana

    if (marginLevel > WARNING_LEVEL) {
      riskLevel = 'BAJO';
      liquidationStatus = 'El Nivel de Margen es saludable.';
    } else if (marginLevel > CRITICAL_LEVEL) {
      riskLevel = 'MEDIO';
      liquidationStatus = `El Nivel de Margen (${marginLevel.toFixed(4)}) está por debajo de ${WARNING_LEVEL}. Considere añadir colateral.`;
    } else if (marginLevel > 1.0) {
      riskLevel = 'ALTO';
      liquidationStatus = `¡ATENCIÓN! Nivel de Margen (${marginLevel.toFixed(4)}) muy cerca del límite de liquidación. Necesita añadir colateral URGENTE.`;
    } else if (marginLevel <= 1.0) {
      riskLevel = 'CRÍTICO';
      liquidationStatus = `¡PELIGRO DE LIQUIDACIÓN! Nivel de Margen en ${marginLevel.toFixed(4)}. La liquidación forzosa es inminente o ya está en proceso.`;
    }

    // Calcular el porcentaje de PNL (basado en la deuda/pasivo, ya que el capital inicial no está disponible)
    const pnlPercentage =
      totalLiabilityOfBtc > 0 ? (unrealizedPNL / totalLiabilityOfBtc) * 100 : 0;

    return {
      totalUnrealizedPNL: unrealizedPNL.toFixed(8),
      pnlCurrency: accountInfo.quoteAsset,
      marginLevel: marginLevel.toFixed(8),
      riskLevel: riskLevel, // ✅ Ahora está garantizado que tiene un valor
      liquidationStatus: liquidationStatus, // ✅ Ahora está garantizado que tiene un valor
      totalLiabilityOfBtc: totalLiabilityOfBtc.toFixed(8),
      pnlAsPercentageOfLiability: pnlPercentage.toFixed(2),
      assetsSummary: accountInfo.userAssets
        .filter(
          (asset: any) =>
            parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) !== 0,
        )
        .map((asset: any) => ({
          asset: asset.asset,
          netAsset: parseFloat(asset.netAsset).toFixed(8),
          borrowed: parseFloat(asset.borrowed).toFixed(8),
        })),
    };
  }

  async getCrossMarginSaldo() {
    // Reutilizamos la función existente para obtener la información de la cuenta
    const accountInfo = await this.getCrossMarginAccountInfo();

    const totalNetAssetOfBtc = parseFloat(accountInfo.totalNetAssetOfBtc);

    return {
      assetsSummary: accountInfo.userAssets
        .filter(
          (asset: any) =>
            parseFloat(asset.borrowed) > 0 || parseFloat(asset.netAsset) !== 0,
        )
        .map((asset: any) => ({
          asset: asset.asset,
          netAsset: parseFloat(asset.netAsset).toFixed(8),
          borrowed: parseFloat(asset.borrowed).toFixed(8),
        })),
    };
  }
  async getDecimalsForSymbol(
    symbol: string,
  ): Promise<{ priceDecimals: number; quantityDecimals: number }> {
    const { priceFilter, lotSizeFilter } =
      await this.obtenerFiltrosSimbolo(symbol);

    if (!priceFilter || !lotSizeFilter) {
      throw new Error(`No se encontraron filtros para el símbolo ${symbol}`);
    }

    const countDecimals = (numStr: string) => {
      const decimalPart = numStr.split('.')[1];
      return decimalPart ? decimalPart.replace(/0+$/, '').length : 0;
    };

    const priceDecimals = countDecimals(priceFilter.tickSize);
    const quantityDecimals = countDecimals(lotSizeFilter.stepSize);

    return { priceDecimals, quantityDecimals };
  }

  async liquiCrossMagin(): Promise<void> {
    // 1. Obtener todos los saldos y deudas actuales en margin cruzado
    const data = await this.getCrossMarginSaldo();

    // Separar activos con deuda y activos disponibles para vender
    const debtAssets = data.assetsSummary.filter(
      (a) => parseFloat(a.borrowed) > 0,
    );
    const sellAssets = data.assetsSummary.filter(
      (a) => a.asset === 'FDUSD' && parseFloat(a.netAsset) > 1,
    );

    // Procesar cada activo con deuda, intentando pagar con FDUSD disponible
    for (const debtAsset of debtAssets) {
      const sellAsset = sellAssets.length > 0 ? sellAssets[0] : null;

      if (!sellAsset) {
        console.log(
          `No hay FDUSD disponible para liquidar deuda de ${debtAsset.asset}`,
        );
        continue; // Pasar a la siguiente deuda
      }

      const symbol = `${debtAsset.asset}${sellAsset.asset}`;
      const decimalQuantity = await this.getDecimalsForSymbol(symbol);
      const priceData = await this.getSymbolPrice(symbol);
      const price = parseFloat(priceData.price);

      const sellQuantity = parseFloat(sellAsset.netAsset).toFixed(
        decimalQuantity.quantityDecimals,
      );

      // Cancelar órdenes abiertas en el par
      await this.cancelAllCrossMarginOrdersBySide(symbol, 'BUY');
      await this.cancelAllCrossMarginOrdersBySide(symbol, 'SELL');

      // Crear orden de mercado para vender FDUSD y recibir moneda para pagar deuda
      await this.createCrossMarginMarketOrder(symbol, 'SELL', sellQuantity);

      // Repagar deuda con el dinero obtenido
      await this.repayCrossMargin(
        debtAsset.asset,
        debtAsset.borrowed.toString(),
      );

      console.log(`Deuda de ${debtAsset.asset} liquidada usando FDUSD.`);
    }

    // Si no hay deuda, pero hay balance en otras criptos distintas de FDUSD, venderlas para tener solo FDUSD
    const nonFdusdAssets = data.assetsSummary.filter(
      (a) => a.asset !== 'FDUSD' && parseFloat(a.netAsset) > 1,
    );

    for (const asset of nonFdusdAssets) {
      const symbol = `${asset.asset}FDUSD`;
      const decimalQuantity = await this.getDecimalsForSymbol(symbol);
      const priceData = await this.getSymbolPrice(symbol);
      const price = parseFloat(priceData.price);

      const sellQuantity = parseFloat(asset.netAsset).toFixed(
        decimalQuantity.quantityDecimals,
      );

      await this.cancelAllCrossMarginOrdersBySide(symbol, 'BUY');
      await this.cancelAllCrossMarginOrdersBySide(symbol, 'SELL');

      await this.createCrossMarginMarketOrder(symbol, 'SELL', sellQuantity);

      console.log(`Activo ${asset.asset} vendido para convertir a FDUSD.`);
    }

    if (debtAssets.length === 0 && nonFdusdAssets.length === 0) {
      console.log('No hay deudas ni activos para convertir a FDUSD.');
    }
  }

  async firmar() {
    // Función vacía o con la lógica que necesites implementar
  }

  async getBnbBurnStatus(): Promise<{
    spotBNBBurn: boolean;
    interestBNBBurn: boolean;
  }> {
    const res = await this.getSigned('/sapi/v1/bnbBurn', {});
    return {
      spotBNBBurn: this.parseBool(res?.spotBNBBurn),
      interestBNBBurn: this.parseBool(res?.interestBNBBurn),
    };
  }

  async setBnbBurn(
    spotBNBBurn: boolean,
    interestBNBBurn: boolean,
  ): Promise<{ spotBNBBurn: boolean; interestBNBBurn: boolean }> {
    const res = await this.postSigned('/sapi/v1/bnbBurn', {
      spotBNBBurn: spotBNBBurn ? 'true' : 'false',
      interestBNBBurn: interestBNBBurn ? 'true' : 'false',
    });
    return {
      spotBNBBurn: this.parseBool(res?.spotBNBBurn),
      interestBNBBurn: this.parseBool(res?.interestBNBBurn),
    };
  }

  async getBnbBalance(): Promise<{
    free: number;
    locked: number;
    total: number;
  }> {
    const account = await this.getAccountInfo();
    const bnb = (account?.balances ?? []).find((b: any) => b.asset === 'BNB');
    const free = Number(bnb?.free ?? 0);
    const locked = Number(bnb?.locked ?? 0);
    return { free, locked, total: free + locked };
  }

  private parseBool(v: any): boolean {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    return false;
  }
}
