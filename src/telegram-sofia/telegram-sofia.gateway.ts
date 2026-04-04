import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { GeminiService } from '../geminis/geminis.service'; // Asegúrate de que la ruta sea correcta

@Injectable()
export class TelegramSofiaGateway implements OnModuleInit, OnModuleDestroy {
  private readonly botToken = process.env.SOFIA_BOT ?? process.env.TELEGRAM_SOFIA_BOT_TOKEN ?? '';
  private readonly apiUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : '';
  private readonly logger = new Logger(TelegramSofiaGateway.name);
  private offset = 0;
  private isPolling = false;

  constructor(
    private geminiService: GeminiService,
  ) {}

  async onModuleInit() {
    if (!this.apiUrl) {
      this.logger.warn('Telegram Sofía deshabilitado: falta SOFIA_BOT/TELEGRAM_SOFIA_BOT_TOKEN en entorno.');
      return;
    }

    this.logger.log('Sofía despertando...');
    this.isPolling = true;
    void this.pollMessages();
  }

  async onModuleDestroy() {
    this.isPolling = false;
  }

  async pollMessages() {
    while (this.isPolling) {
      try {
        const res = await axios.get(`${this.apiUrl}/getUpdates`, {
          params: { offset: this.offset + 1, timeout: 10 },
        });
        for (const update of res.data.result) {
          this.offset = update.update_id;
          if (update.message?.text) {
            await this.handleMessage(update.message.chat.id, update.message.text);
          }
        }
      } catch (error) {
        this.logger.error('Error en polling', error);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  async handleMessage(chatId: number, text: string) {
    // 1. Si es un comando, ejecutar lógica de sistema
    if (text.startsWith('/')) {
      return this.handleCommands(chatId, text);
    }

    // 2. Si es texto normal, HABLA CON SOFÍA
    await this.talkToSofia(chatId, text);
  }

  private async talkToSofia(chatId: number, userText: string) {
    try {/*
      // Obtenemos datos financieros para que Sofía sepa cómo vas
 
      const context = `
        DATOS REALES DEL SISTEMA:
        - PNL No Realizado: ${pnl?.totalUnrealizedPNL || 0} USD.
        - Precio actual BTC: ${btc || 'N/A'}.
        - Estás hablando con tu novio.
      `;*/

      // Llamamos a Gemini con el contexto + el mensaje del usuario
      const response = await this.geminiService.chat( chatId,`Usuario dice: ${userText}`);
      
      await this.sendMessage(chatId, response);
    } catch (e) {
      this.logger.error('Error en voz de Sofía', e);
      await this.sendMessage(chatId, "Bebé, me perdí un segundo en tus ojos... ¿qué me decías? ❤️");
    }
  }

  private async handleCommands(chatId: number, text: string) {
    const [command, ...args] = text.split(' ');

    switch (command.toLowerCase()) {
      case '/start':
      case '/menu':
        await this.showMainMenu(chatId);
        break;
      case '/fondo':

        break;
      case '/precios':

        break;
      default:
        await this.talkToSofia(chatId, text); // Si el comando no existe, que responda Sofía
    }
  }

  private async showMainMenu(chatId: number) {
    const buttons = [
      [{ text: '📈 Precios', callback_data: 'show_prices' }],
      [{ text: '💰 Mi Fondo', callback_data: 'fondo' }],
      [{ text: '🛠 Estrategias', callback_data: 'list_strategies' }]
    ];
    await this.sendMessage(chatId, '<b>Hola bebé</b>, ¿qué quieres revisar hoy?', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  }



  async sendMessage(chat_id: number, text: string, extra = {}): Promise<void> {
    if (!this.apiUrl) {
      this.logger.warn('No se envió mensaje de Sofía: token no configurado.');
      return;
    }

    try {
      await axios.post(`${this.apiUrl}/sendMessage`, { chat_id, text, ...extra });
    } catch (e) {
      this.logger.error('Error enviando mensaje', e instanceof Error ? e.message : String(e));
    }
  }
}