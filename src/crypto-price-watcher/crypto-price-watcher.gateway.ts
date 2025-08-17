import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as WebSocket from 'ws'; // Se necesita un cliente WebSocket

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class CryptoPriceWatcherGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly binanceWebSocket: WebSocket;

  constructor() {
    // Conexión con el WebSocket de Binance para LINKFDUSD
    this.binanceWebSocket = new WebSocket('wss://stream.binance.com:9443/ws/linkfdusd@trade');
  }

  afterInit(server: Server) {
    console.log('Gateway inicializado. Conectando a Binance...');

    this.binanceWebSocket.onmessage = (event) => {
      const tradeData = JSON.parse(event.data.toString());
      const btcPrice = tradeData.p; // El precio de la transacción

      if (btcPrice) {
        // Emite el nuevo precio de BTC a todos los clientes conectados
        this.server.emit('btc-price-update', btcPrice);
        console.log(`Nuevo precio de BTC: ${btcPrice}`);
      }
    };

    this.binanceWebSocket.onopen = () => {
      console.log('Conectado exitosamente al WebSocket de Binance.');
    };

    this.binanceWebSocket.onerror = (error) => {
      console.error('Error en la conexión con Binance WebSocket:', error);
    };

    this.binanceWebSocket.onclose = () => {
      console.log('Conexión con Binance WebSocket cerrada.');
    };
  }
}