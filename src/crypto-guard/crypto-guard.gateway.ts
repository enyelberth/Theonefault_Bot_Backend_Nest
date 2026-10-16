import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaClient, RiskConfig } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { BinanceService } from '../binance/binance.service';
import { BotService } from '../bot/bot.service';
import { jwtConstants } from '../authA/constantes';

const BALANCE_REFRESH_MS = 60_000;
const CONFIG_REFRESH_MS = 30_000;

@WebSocketGateway()
export class CryptoGuardGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private binanceWSConnections: Map<string, WebSocket> = new Map();
  private cryptoSymbols = ['btcusdt', 'ethusdt', 'bnbusdt'];

  private fdusdBalance = 0; // FDUSD real en spot (Binance), no el ledger interno de Account.
  private marginFdusdBalance = 0; // FDUSD real en margin cruzado (netAsset).
  private lastBalanceRefreshAt = 0;

  private btcusdtPrice: string | null = null;
  private binanceData: any;
  private totalUnrealizedPNL: string | undefined;

  private riskConfig: RiskConfig | null = null;
  private lastConfigRefreshAt = 0;

  private breachTicks = 0;
  private guardCooldownUntil = 0;
  private lastLoggedStatus: 'ok' | 'guard' | 'cooldown' | null = null;
  private lastLoggedPnl: number | null = null;
  private lastPortfolioLoggedAt = 0;

  private readonly prisma = new PrismaClient();

  constructor(
    private binanceService: BinanceService,
    private botService: BotService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: Socket) {
    const rawToken =
      client.handshake.auth?.token ||
      client.handshake.headers.authorization ||
      '';
    const token = String(rawToken)
      .replace(/^Bearer\s+/i, '')
      .trim();
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      client.data.user = await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
    } catch {
      client.disconnect(true);
    }
  }

  async afterInit() {
    await this.refreshRiskConfig();
    await this.refreshBalance(true);

    try {
      this.binanceData = await this.binanceService.getCrossMarginPNLSummary();
      this.totalUnrealizedPNL = this.binanceData?.totalUnrealizedPNL;
    } catch (err) {
      console.warn(
        `[CryptoGuardGateway] margin PNL summary skipped: ${(err as Error).message}`,
      );
      this.binanceData = null;
    }

    this.cryptoSymbols.forEach((symbol) => this.connectBinanceStream(symbol));
    console.log(
      `[CryptoGuard] init. FDUSD=${this.fdusdBalance} bufferPct=${this.riskConfig?.guardBufferPct}`,
    );
  }

  private async refreshRiskConfig() {
    try {
      const cfg = await this.prisma.riskConfig.findUnique({ where: { id: 1 } });
      if (cfg) this.riskConfig = cfg;
      this.lastConfigRefreshAt = Date.now();
    } catch (err) {
      console.warn(
        `[CryptoGuard] refreshRiskConfig fail: ${(err as Error).message}`,
      );
    }
  }

  private async refreshBalance(force = false) {
    const now = Date.now();
    if (!force && now - this.lastBalanceRefreshAt < BALANCE_REFRESH_MS) return;
    try {
      const spotBalances = await this.binanceService.getNonZeroBalances();
      const fdusdSpot = spotBalances.find(
        (b: any) => b.asset === 'FDUSD',
      );
      this.fdusdBalance = fdusdSpot
        ? Number(fdusdSpot.free) + Number(fdusdSpot.locked)
        : 0;
    } catch (err) {
      console.warn(
        `[CryptoGuard] refreshBalance (spot) fail: ${(err as Error).message}`,
      );
    }

    try {
      const margin = await this.binanceService.getCrossMarginLoans();
      const fdusdMargin = margin?.userAssets?.find(
        (a: any) => a.asset === 'FDUSD',
      );
      this.marginFdusdBalance = fdusdMargin
        ? Number(fdusdMargin.netAsset)
        : 0;
    } catch (err) {
      console.warn(
        `[CryptoGuard] refreshBalance (margin) fail: ${(err as Error).message}`,
      );
    }

    this.lastBalanceRefreshAt = now;
  }

  private guardEnabled(): boolean {
    return !!this.riskConfig?.enabled;
  }

  private computeThreshold(): number {
    const bufferPct = this.riskConfig?.guardBufferPct ?? 4;
    // Capital real total (spot + margin cruzado), no solo spot: si el capital
    // vive en margin (ej. transferido a propósito), el umbral no debe colapsar
    // a 0 y volverse hipersensible a cualquier PnL negativo microscópico.
    const totalCapital = this.fdusdBalance + this.marginFdusdBalance;
    return totalCapital - totalCapital * (bufferPct / 100);
  }

  async connectBinanceStream(symbol: string) {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@trade`;
    const ws = new WebSocket(wsUrl);

    // Each symbol stream only updates shared price state and relays the
    // tick to clients. Breach evaluation itself runs on a single shared
    // timer (see startGuardLoop/evaluateGuard) so that `breachTicks` is
    // incremented at most once per real time interval, regardless of how
    // many of the 3 symbol streams happen to deliver a message around the
    // same instant — otherwise 3 near-simultaneous messages could satisfy
    // `guardConfirmTicks` almost instantly instead of over N separate
    // confirmation intervals, defeating the anti-flicker guard.
    ws.onmessage = (event) => {
      const trade = JSON.parse(event.data);
      const price = trade.p;
      if (symbol === 'btcusdt') this.btcusdtPrice = price;
      this.server.emit('cryptoPriceUpdate', { symbol, price });
    };

    ws.onopen = () => console.log(`Conectado Binance WS ${symbol}`);
    ws.onerror = (error) => console.error(`Error Binance WS ${symbol}:`, error);
    ws.onclose = () => {
      console.warn(`Desconectado Binance WS ${symbol}, reconectando...`);
      setTimeout(() => this.connectBinanceStream(symbol), 5000);
    };

    this.binanceWSConnections.set(symbol, ws);
    this.startGuardLoop();
  }

  private guardTimer: ReturnType<typeof setInterval> | null = null;

  private startGuardLoop() {
    if (this.guardTimer) return;
    this.guardTimer = setInterval(() => {
      this.evaluateGuard().catch((e) =>
        console.error(
          '[CryptoGuard] evaluateGuard error:',
          (e as Error).message,
        ),
      );
    }, 4000);
  }

  private async evaluateGuard(): Promise<void> {
    const now = Date.now();

    if (now - this.lastConfigRefreshAt > CONFIG_REFRESH_MS) {
      await this.refreshRiskConfig();
    }
    await this.refreshBalance();

    try {
      this.binanceData = await this.binanceService.getCrossMarginPNLSummary();
      this.totalUnrealizedPNL = this.binanceData?.totalUnrealizedPNL;
    } catch {
      return;
    }

    if (!this.totalUnrealizedPNL || !this.btcusdtPrice) return;

    const pnlValue =
      Number(this.totalUnrealizedPNL) * Number(this.btcusdtPrice);
    const threshold = this.computeThreshold();

    const pnlChanged =
      this.lastLoggedPnl === null ||
      Math.abs(pnlValue - this.lastLoggedPnl) > 1e-6;
    if (pnlChanged) {
      this.lastLoggedPnl = pnlValue;
      const color =
        pnlValue > 0 ? '\x1b[32m' : pnlValue < 0 ? '\x1b[31m' : '\x1b[90m';
      const arrow = pnlValue > 0 ? '▲' : pnlValue < 0 ? '▼' : '·';
      const breachTag =
        this.breachTicks > 0
          ? ` \x1b[33mbreach=${this.breachTicks}\x1b[0m`
          : '';
      console.log(
        `\x1b[35m[Guard]\x1b[0m ${color}${arrow} PNL ${pnlValue.toFixed(4)} USDT\x1b[0m thr=${threshold.toFixed(4)}${breachTag}`,
      );
    }

    if (now - this.lastPortfolioLoggedAt > 60_000) {
      this.lastPortfolioLoggedAt = now;
      try {
        const port = await this.binanceService.getBalancesInUsdt();
        const top = port.assets
          .filter((a) => a.usdtValue >= 1)
          .slice(0, 10)
          .map((a) => `\x1b[36m${a.asset}\x1b[0m=${a.usdtValue.toFixed(2)}`)
          .join(' ');
        console.log(
          `\x1b[35m[Guard]\x1b[0m \x1b[1mCartera ${port.totalUsdt.toFixed(2)} USDT\x1b[0m  ${top}`,
        );
        this.server.emit('portfolioUpdate', port);
      } catch {
        // ignore
      }
    }

    if (!this.guardEnabled()) return;

    // Cooldown activo → no re-disparar
    if (now < this.guardCooldownUntil) {
      if (this.lastLoggedStatus !== 'cooldown') {
        this.lastLoggedStatus = 'cooldown';
        console.log(
          `[CryptoGuard] En cooldown hasta ${new Date(this.guardCooldownUntil).toISOString()}`,
        );
      }
      return;
    }

    const confirmTicks = this.riskConfig?.guardConfirmTicks ?? 3;

    if (pnlValue < threshold) {
      this.breachTicks += 1;
      if (this.breachTicks < confirmTicks) {
        console.log(
          `[CryptoGuard] Breach ${this.breachTicks}/${confirmTicks}, esperando confirmación`,
        );
        return;
      }
      await this.triggerProtection(pnlValue, threshold);
    } else {
      if (this.breachTicks > 0) {
        console.log(
          `[CryptoGuard] Recuperado, reset breachTicks (era ${this.breachTicks})`,
        );
        this.breachTicks = 0;
      }
      if (this.lastLoggedStatus !== 'ok') {
        this.lastLoggedStatus = 'ok';
        console.log('[CryptoGuard] Todo en orden');
      }
    }
  }

  private async triggerProtection(pnlValue: number, threshold: number) {
    this.lastLoggedStatus = 'guard';
    const cooldownMin = this.riskConfig?.guardCooldownMinutes ?? 15;
    this.guardCooldownUntil = Date.now() + cooldownMin * 60_000;
    this.breachTicks = 0;

    console.log(
      `[CryptoGuard] PROTECCIÓN DISPARADA. pnl=${pnlValue.toFixed(4)} < threshold=${threshold.toFixed(4)}. Cooldown ${cooldownMin}min`,
    );

    try {
      await this.prisma.riskEvent.create({
        data: {
          type: 'CRYPTO_GUARD',
          message: `pnl=${pnlValue.toFixed(4)} threshold=${threshold.toFixed(4)}`,
          action: 'STOPPED_ALL',
          metadata: {
            pnlValue,
            threshold,
            cooldownUntil: this.guardCooldownUntil,
          },
        },
      });
    } catch (err) {
      console.warn(`[CryptoGuard] logEvent fail: ${(err as Error).message}`);
    }

    try {
      const active = await this.botService.getActiveBots();
      const targets = active.map((k) => {
        const [sym, id] = k.split('-');
        return { symbol: sym, id };
      });
      for (const t of targets) {
        try {
          await this.botService.stopStrategy(t.symbol, t.id);
        } catch (err) {
          console.warn(
            `[CryptoGuard] stop ${t.symbol}/${t.id} fail: ${(err as Error).message}`,
          );
        }
      }
      await this.binanceService.liquiCrossMagin();
      console.log('[CryptoGuard] Bots detenidos + margen cruzado liquidado');
    } catch (error) {
      console.error(
        '[CryptoGuard] Error ejecutando protección:',
        (error as Error).message || error,
      );
    }
  }
}
