import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    MessageBody,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { IndicatorsService } from 'src/indicators/indicators.service';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class RsiGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    constructor(private readonly indicatorsService: IndicatorsService) { }

    handleConnection(client: Socket) {
        console.log(`Cliente conectado: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        console.log(`Cliente desconectado: ${client.id}`);
    }

    // El cliente puede pedir el RSI con este mensaje tipo "getRsi"
    // pasando symbol, period e intervalMinutes en el cuerpo
    @SubscribeMessage('getRsi')
    async handleGetRsi(
        @MessageBody()
        data: {
            symbol: string;
            period?: number;
            intervalMinutes?: number;
        },
        client: Socket,
    ) {
        try {
            const period = data.period ?? 14;
            const intervalMinutes = data.intervalMinutes ?? 1;

            // Calcular RSI usando el servicio
            const rsi = await this.indicatorsService.calculateRSIWithInterval(
                data.symbol,
                period,
                intervalMinutes,
            );

            // Enviar el resultado solo al cliente que hizo la petición
            client.emit('rsiResult', {
                symbol: data.symbol,
                rsi,
                period,
                intervalMinutes,
            });
        } catch (error) {
            client.emit('rsiError', { message: 'Error calculando RSI', error });
        }
    }
}
