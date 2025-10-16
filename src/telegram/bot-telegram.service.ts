import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { CryptoPriceService } from '../crypto-price/crypto-price.service';

interface ChatState {
  waitingForSymbol: boolean;
}

interface PriceAlert {
  chatId: number;
  symbol: string;
  threshold: number;
  condition: 'arriba' | 'abajo';
}

@Injectable()
export class BotTelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly botToken = '8314324600:AAHxwt3fUaP3-XNuq4jgdWPDxN6IC0UNTHY';
  private readonly apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  private readonly logger = new Logger(BotTelegramService.name);
  private offset = 0;
  private chatStates = new Map<number, ChatState>();
  private alerts: PriceAlert[] = [];

  constructor(private cryptoPrice: CryptoPriceService) {}

  async onModuleInit() {
    this.logger.log('Iniciando polling para Telegram bot...');
    this.pollMessages();
    setInterval(() => this.checkAlerts(), 15_000);
  }

  async onModuleDestroy() {
    this.logger.log('Deteniendo bot...');
  }

  async pollMessages() {
    while (true) {
      try {
        const res = await axios.get(`${this.apiUrl}/getUpdates`, {
          params: { offset: this.offset + 1, timeout: 10 },
        });
        if (res.data.result.length) {
          for (const update of res.data.result) {
            this.offset = update.update_id;
            if (update.message && update.message.text) {
              await this.handleMessage(update.message.chat.id, update.message.text);
            }
          }
        }
      } catch (error) {
        this.logger.error('Error en polling', error);
      }
    }
  }

  async handleMessage(chatId: number, text: string) {
    const state = this.chatStates.get(chatId);

    if (state?.waitingForSymbol) {
      const symbol = text.trim().toUpperCase();
      const price = await this.cryptoPrice.findOne(symbol);
      if (price !== null) {
        await this.sendMessage(chatId, `El precio de ${symbol} es $${price.toFixed(2)}`);
      } else {
        await this.sendMessage(chatId, `No pude encontrar el precio para la moneda ${symbol}. Intenta otra.`);
      }
      this.chatStates.delete(chatId);
      return;
    }

    if (!text.startsWith('/')) {
      await this.sendMessage(chatId, `No entendí tu mensaje: "${text}"`);
      return;
    }

    const [command, ...args] = text.split(' ');
    switch (command.toLowerCase()) {
      case '/start':
        await this.sendMessage(chatId, '¡Hola! Bienvenido al bot.');
        break;

      case '/help':
        await this.sendMessage(chatId,
          'Comandos:\n' +
          '/start - Bienvenida\n' +
          '/help - Ayuda\n' +
          '/echo - Repite mensaje\n' +
          '/precios - Lista todos los precios\n' +
          '/preciomoneda - Pide el símbolo y devuelve su precio\n' +
          '/alerta [símbolo] [precio] [arriba|abajo] - Crear alerta de precio'
        );
        break;

      case '/echo':
        await this.sendMessage(chatId, args.join(' ') || 'No me diste nada para repetir.');
        break;

      case '/precios':
        const prices = await this.cryptoPrice.findAll();
        const message = prices.map(p => `${p.symbol}: $${p.price.toFixed(2)}`).join('\n');
        await this.sendMessage(chatId, `Precios actuales:\n${message}`);
        break;

      case '/preciomoneda':
        this.chatStates.set(chatId, { waitingForSymbol: true });
        await this.sendMessage(chatId, 'Por favor escribe el símbolo de la moneda que quieres consultar (ejemplo: BTCUSDT)');
        break;

      case '/alerta':
        if (args.length === 3) {
          const [symbol, priceStr, condition] = args;
          const threshold = Number(priceStr);
          if (isNaN(threshold) || (condition !== 'arriba' && condition !== 'abajo')) {
            await this.sendMessage(chatId, 'Formato incorrecto. Usa: /alerta [símbolo] [precio] [arriba|abajo]');
          } else {
            this.alerts.push({ chatId, symbol: symbol.toUpperCase(), threshold, condition: condition as 'arriba' | 'abajo' });
            await this.sendMessage(chatId, `Alerta creada para ${symbol} ${condition} de $${threshold}`);
          }
        } else {
          await this.sendMessage(chatId, 'Uso: /alerta [símbolo] [precio] [arriba|abajo]');
        }
        break;

      default:
        await this.sendMessage(chatId, `Comando "${command}" no reconocido.`);
        break;
    }
  }

  async checkAlerts() {
    for (const alert of [...this.alerts]) { // Copia para permitir modificaciones
      const price = await this.cryptoPrice.findOne(alert.symbol);
      if (price === null) continue;

      if (
        (alert.condition === 'arriba' && price >= alert.threshold) ||
        (alert.condition === 'abajo' && price <= alert.threshold)
      ) {
        await this.sendMessage(alert.chatId, `Alerta: ${alert.symbol} está ${alert.condition} de $${alert.threshold}. Precio actual: $${price.toFixed(2)}`);
        this.alerts = this.alerts.filter(a => a !== alert);
      }
    }
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
      });
      this.logger.log(`Mensaje enviado a ${chatId}: ${text}`);
    } catch (error) {
      this.logger.error('Error enviando mensaje', error);
    }
  }
}
