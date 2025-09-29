import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { IndicatorsService } from 'src/indicators/indicators.service';
import * as WebSocket from 'ws';


@WebSocketGateway({
  cors: { origin: '*' },
})
export class CryptoPriceWatcherGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly binanceSockets: Record<string, WebSocket> = {};
  private readonly symbols = ['btcfdusd','linkfdusd','dogefdusd','xrpfdusd','bnbfdusd','dogefdusd','solfdusd']; // Puedes incluir más símbolos

  private readonly lastRunAt: Record<string, number> = {};
  private readonly MIN_INTERVAL_MS = 60 * 1000; // 1 minuto

  constructor(private readonly indicatorsService: IndicatorsService) {
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
        console.log(`Conectado a Binance WS para ${symbol}`);
      });

      ws.on('message', async (data: WebSocket.RawData) => {
        try {
          const tradeData = JSON.parse(data.toString());
          const price = parseFloat(tradeData?.p); // Precio actual

          if (!isFinite(price)) return;

          const now = Date.now();
          const last = this.lastRunAt[symbol] ?? 0;

          // Solo guardar máximo cada minuto
          if (now - last < this.MIN_INTERVAL_MS) {
            // Emitir valor en tiempo real sin guardar
            this.server.emit(`${symbol}-price-update`, price);
            return;
          }
          this.lastRunAt[symbol] = now;

          // Guardar precio en la base de datos
          await this.indicatorsService.createCryptoPrice({
            symbol: symbol.toUpperCase(),
            price,
            volume: parseFloat(tradeData.q), // Volumen del trade
            timestamp: new Date(tradeData.T),
          });

          // Emitir actualización a clientes conectados
          this.server.emit(`${symbol}-price-update`, price);
         // console.log(`Precio guardado y emitido para ${symbol}: ${price}`);
        } catch (err) {
          console.error(`Error procesando mensaje de ${symbol}:`, err);
        }
      });

      ws.on('error', (error) => {
        console.error(`Error en Binance WS (${symbol}):`, error);
      });

      ws.on('close', () => {
        console.log(`Conexión Binance WS cerrada para ${symbol}`);
      });
    });
  }
}
