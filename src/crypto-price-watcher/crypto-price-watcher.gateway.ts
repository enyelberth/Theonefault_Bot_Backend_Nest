import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as WebSocket from 'ws';
import { TradingService } from 'src/trading/trading.service';
import { BinanceService } from 'src/binance/binance.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class CryptoPriceWatcherGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly binanceSockets: Record<string, WebSocket> = {};
  private readonly symbols = ['linkfdusd'];

  // Mapea símbolo -> tradingPairId en tu DB
  private readonly symbolToPairId: Record<string, number> = {
    linkfdusd: 1,
  };

  // Control de frecuencia (debounce)
  private readonly lastRunAt: Record<string, number> = {};
  private readonly MIN_INTERVAL_MS = 200; // Máx 5 ticks/seg por símbolo

  constructor(private readonly tradingService: TradingService,
    private readonly binanceService: BinanceService
  ) {
    // Conectar sockets de Binance
    this.symbols.forEach((symbol) => {
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@trade`;
      const ws = new WebSocket(wsUrl);
      this.binanceSockets[symbol] = ws;
    });
  }

  afterInit() {
    console.log('Gateway inicializado. Conectando a Binance...');

    this.symbols.forEach((symbol) => {
      const ws = this.binanceSockets[symbol];

      ws.on('open', () => {
     //   console.log(process.env.BASE_URL);
      //  console.log(`Conectado a Binance WS para ${symbol}`);
      });

      ws.on('message', async (data: WebSocket.RawData) => {
        try {
          const tradeData = JSON.parse(data.toString());
          const price = parseFloat(tradeData?.p); // Binance manda 'p' como string

          // Validar precio
          if (!isFinite(price)) return;

          // Debounce para evitar exceso de transacciones
          const now = Date.now();
          const last = this.lastRunAt[symbol] ?? 0;
          if (now - last < this.MIN_INTERVAL_MS) {
            this.server.emit(`${symbol}-price-update`, price);
            return;
          }
          this.lastRunAt[symbol] = now;

          // Obtener tradingPairId del mapa
          const tradingPairId = this.symbolToPairId[symbol];
          if (!tradingPairId) {
            console.warn(`No hay tradingPairId configurado para ${symbol}`);
            return;
          }
          
        //  const a =  await this.binanceService.getAccountBalance();
     //     console.log(a);

          // Procesar tick de precio (esperando a que termine)
         // console.log(price)
       //   await this.tradingService.processPriceTick(1, price);

          // Enviar precio a los clientes conectados
          this.server.emit(`${symbol}-price-update`, price);

        } catch (err) {
          console.error(`Error procesando mensaje de ${symbol}:`, err);
        }
      });

      ws.on('error', (error) => {
        console.error(`Error en Binance WS (${symbol}):`, error);
      });

      ws.on('close', () => {
        console.log(`Conexión Binance WS cerrada para ${symbol}`);
        // Aquí podrías implementar reconexión automática
      });
    });
  }
}
