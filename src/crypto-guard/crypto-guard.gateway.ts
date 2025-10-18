import { WebSocketGateway, WebSocketServer, OnGatewayInit } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';
import { BotService } from 'src/bot/bot.service';

@WebSocketGateway()
export class CryptoGuardGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private binanceWSConnections: Map<string, WebSocket> = new Map();

  private cryptoSymbols = ['btcusdt', 'ethusdt', 'bnbusdt'];

  private userCryptos: Array<{ symbol: string; balance: number }> = [];

  private fdusdBalance: number = 0;
  private btcusdtPrice: string | null = null;

  private binanceData: any;
  private marginLevel: string;
  private totalUnrealizedPNL: string;
  private riskLevel: string;
  private totalLiabilityOfBtc: string;
  private pnlAsPercentageOfLiability: string;

  constructor(
    private accountService: AccountService,
    private binanceService: BinanceService,
    private botService: BotService,
  ) {}

  async afterInit() {
    const cryptosRaw = await this.accountService.findCryptosByUserId(1);
    const binanceData = this.binanceService.getCrossMarginPNLSummary();

    this.binanceData = await binanceData;
    this.totalUnrealizedPNL = this.binanceData?.totalUnrealizedPNL;
    this.riskLevel = this.binanceData?.riskLevel;
    this.totalLiabilityOfBtc = this.binanceData?.totalLiabilityOfBtc;
    this.pnlAsPercentageOfLiability = this.binanceData?.pnlAsPercentageOfLiability;

    this.userCryptos = cryptosRaw.map(c => ({
      symbol: c.symbol,
      balance: c.balance.toNumber(),
    }));

    const fdusdEntry = this.userCryptos.find(c => c.symbol.toUpperCase() === 'FDUSD');
    this.fdusdBalance = fdusdEntry ? fdusdEntry.balance : 0;

    this.cryptoSymbols.forEach(symbol => this.connectBinanceStream(symbol));

    console.log(`Balance FDUSD encontrado: ${this.fdusdBalance}`);
  }
async connectBinanceStream(symbol: string) {
  const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@trade`;
  const ws = new WebSocket(wsUrl);

  let lastEmitTime = 0;

  ws.onmessage = async (event) => {
    const now = Date.now();
    if (now - lastEmitTime < 4000) { // Limita a 4 segundos
      return; // Ignora el mensaje si no han pasado 4 segundos desde la última ejecución
    }
    lastEmitTime = now;

    const trade = JSON.parse(event.data);
    const price = trade.p;

    if (symbol === 'btcusdt') {
      this.btcusdtPrice = price;
    }

    const pnlValue = Number(this.totalUnrealizedPNL) * Number(this.btcusdtPrice);
    const threshold = this.fdusdBalance - (this.fdusdBalance * 0.0003);
    console.log(pnlValue);
    if ( pnlValue<threshold ) {
      console.log('Ejecutando proteccion de Crypto Guard');
      try {
     //   await this.binanceService.cancelAllCrossMarginOrdersBySide('LINKFDUSD', 'BUY');
        console.log(pnlValue);

      //  console.log(`${this.botService.getActiveBots()}`);
     //   this.botService.stopStrategy(`${this.botService.getActiveBots()}`);
        console.log("Cancelando posiciones de margen cruzado");
      } catch (error) {
        console.error('Error cancelando órdenes margin cruzado:', error.message || error);
      }
    } else {
        await this.binanceService.liquiCrossMagin();

      console.log('Todo en orden');
    }

    this.server.emit('cryptoPriceUpdate', { symbol, price });
  };

  ws.onopen = () => {
    console.log(`Conectado a Binance WebSocket para ${symbol}`);
  };

  ws.onerror = (error) => {
    console.error(`Error Binance WS ${symbol}:`, error);
  };

  ws.onclose = () => {
    console.warn(`Desconectado de Binance WS ${symbol}, reconectando...`);
    setTimeout(() => this.connectBinanceStream(symbol), 5000);
  };

  this.binanceWSConnections.set(symbol, ws);
}


}
