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

  private fdusdBalance = 0;
  private btcusdtPrice: string | null = null;

  private binanceData: any;
  private marginLevel: string | undefined;
  private totalUnrealizedPNL: string | undefined;
  private riskLevel: string | undefined;
  private totalLiabilityOfBtc: string | undefined;
  private pnlAsPercentageOfLiability: string | undefined;

  constructor(
    private accountService: AccountService,
    private binanceService: BinanceService,
    private botService: BotService,
  ) {}

  async afterInit() {
    const cryptosRaw = await this.accountService.findCryptosByUserId(1);
    this.binanceData = await this.binanceService.getCrossMarginPNLSummary();

    this.totalUnrealizedPNL = this.binanceData?.totalUnrealizedPNL;
    this.riskLevel = this.binanceData?.riskLevel;
    this.totalLiabilityOfBtc = this.binanceData?.totalLiabilityOfBtc;
    this.pnlAsPercentageOfLiability = this.binanceData?.pnlAsPercentageOfLiability;

    this.userCryptos = cryptosRaw.map(c => ({
      symbol: c.symbol,
      balance: Number(c.balance), // Se asume que balance puede convertirse a number directamente
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
    this.binanceData = await this.binanceService.getCrossMarginPNLSummary();
    this.totalUnrealizedPNL = this.binanceData?.totalUnrealizedPNL;

      if (!this.totalUnrealizedPNL || !this.btcusdtPrice) {
        return; // Se asegura que existan datos para cálculo
      }

      const pnlValue = Number(this.totalUnrealizedPNL) * Number(this.btcusdtPrice);
      const threshold = this.fdusdBalance - (this.fdusdBalance * 0.04);

      console.log('PNL Value:', pnlValue);

      if (pnlValue < threshold) {
        console.log('Ejecutando protección de Crypto Guard');
        try {
                 const a = await this.botService.getActiveBots();
                 /*
          if(a.length === 0){
            console.log('No hay bots activos');
            return;
          }
            */
              const e = new Array<{symbol: string, id: string}>();
          a.forEach(element=>{
            const i = element.split('-');
            const j = {
              symbol: i[0],
              id: i[1]
            };
            e.push(j);
          });
          console.log(e);
          e.forEach(element=>{
            this.botService.stopStrategy(element.symbol, element.id);
          });
          // Uncomment and update si se desea cancelar órdenes, ejemplo:
          // await this.binanceService.cancelAllCrossMarginOrdersBySide('LINKFDUSD', 'BUY');
         //  await this.binanceService.cancelAllCrossMarginOrdersBySide('LINKFDUSD', 'SELL');

          // await this.binanceService.cancelAllCrossMarginOrdersBySide('XRPFDUSD', 'BUY');
          // await this.binanceService.cancelAllCrossMarginOrdersBySide('XRPFDUSD', 'SELL');

          // Ejemplo de detener bots activos si es necesario
          // this.botService.stopStrategy(this.botService.getActiveBots());


          

            await this.binanceService.liquiCrossMagin();

          console.log("Cancelando posiciones de margen cruzado");
        } catch (error) {
          console.error('Error cancelando órdenes margen cruzado:', (error as Error).message || error);
        }
      } else {
        try {
   
      
          console.log('Todo en orden');
        } catch (error) {
          console.error('Error ejecutando liquidación margen cruzado:', (error as Error).message || error);
        }
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
