import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,

} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common'; // <--- Movido aquí
import { Server } from 'socket.io';
import { IndicatorsService } from 'src/indicators/indicators.service';
import * as WebSocket from 'ws';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class CryptoPriceWatcherGateway implements OnGatewayInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private binanceWs: WebSocket | null = null;
  private readonly symbols = ['btcfdusd', 'linkfdusd', 'dogefdusd', 'xrpfdusd', 'bnbfdusd', 'solfdusd'];
  private readonly lastRunAt: Record<string, number> = {};
  private readonly MIN_INTERVAL_MS = 5 * 1000;

  constructor(private readonly indicatorsService: IndicatorsService) {}

  afterInit() {
    this.connectToBinance();
  }

  private connectToBinance() {
    // Usamos un Stream Combinado para ahorrar recursos
    const streams = this.symbols.map((s) => `${s}@trade`).join('/');
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    this.binanceWs = new WebSocket(wsUrl);

    this.binanceWs.on('open', () => console.log('✅ Conectado al Stream Combinado de Binance'));

    this.binanceWs.on('message', async (data: WebSocket.RawData) => {
      try {
        const { data: tradeData } = JSON.parse(data.toString());
        const symbol = tradeData.s.toLowerCase(); // Binance envía el símbolo en el stream
        const price = parseFloat(tradeData.p);
        
        if (!isFinite(price)) return;

        const now = Date.now();
        const last = this.lastRunAt[symbol] ?? 0;

        // Emitir siempre a los clientes (Tiempo Real)
        this.server.emit(`${symbol}-price-update`, price);

        // Lógica de guardado (Throttling)
        if (now - last >= this.MIN_INTERVAL_MS) {
          this.lastRunAt[symbol] = now;
          
          // No bloqueamos el stream de datos con el await del DB
          this.indicatorsService.createCryptoPrice({
            symbol: symbol.toUpperCase(),
            price,
            volume: parseFloat(tradeData.q),
            timestamp: new Date(tradeData.T),
          }).catch(err => console.error(`Error DB (${symbol}):`, err));
        }
      } catch (err) {
        console.error('Error procesando mensaje:', err);
      }
    });

    this.binanceWs.on('error', (err) => console.error('❌ Error en Binance WS:', err));

    this.binanceWs.on('close', () => {
      console.warn('⚠️ Conexión de Binance cerrada. Reintentando en 5s...');
      setTimeout(() => this.connectToBinance(), 5000); // Auto-reconexión
    });
  }

  // Limpieza al apagar la app
  onModuleDestroy() {
    if (this.binanceWs) {
      this.binanceWs.terminate();
    }
  }
}