import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as WebSocket from 'ws';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class CryptoPriceWatcherGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly binanceSockets: { [key: string]: WebSocket } = {};
  private readonly symbols = ['linkfdusd']; // pares para monitorear

  constructor() {
    // Inicializamos una conexión WebSocket de Binance por cada par
    this.symbols.forEach((symbol) => {
      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@trade`);
      this.binanceSockets[symbol] = ws;
    });
  }

  afterInit(server: Server) {
    console.log('Gateway inicializado. Conectando a Binance...');

    this.symbols.forEach((symbol) => {
      const ws = this.binanceSockets[symbol];

      ws.onopen = () => {
        console.log(`Conectado exitosamente al WebSocket de Binance para ${symbol}`);
      };

      ws.onmessage = (event) => {
        const tradeData = JSON.parse(event.data.toString());
        const price = tradeData.p;

        if (price) {
          // Emitimos el precio con un evento específico para el par
          this.server.emit(`${symbol}-price-update`, price);
          console.log(`Nuevo precio de ${symbol.toUpperCase()}: ${price}`);
        }
      };

      ws.onerror = (error) => {
        console.error(`Error en la conexión con Binance WebSocket para ${symbol}:`, error);
      };

      ws.onclose = () => {
        console.log(`Conexión con Binance WebSocket para ${symbol} cerrada.`);
      };
    });
  }
}
