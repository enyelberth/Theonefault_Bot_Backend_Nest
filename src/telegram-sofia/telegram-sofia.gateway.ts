import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { CryptoPriceService } from '../crypto-price/crypto-price.service';
import { BinanceService } from 'src/binance/binance.service';
import { BotService } from 'src/bot/bot.service';
import { AlertService } from 'src/alert/alert.service';
import { GeminiService } from '../geminis/geminis.service'; // Asegúrate de que la ruta sea correcta

@Injectable()
export class TelegramSofiaGateway implements OnModuleInit {
  private readonly botToken = '8552823999:AAHxaw253153k6oacPS86FEMmS3cH55YGVg';
  private readonly apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  private readonly logger = new Logger(TelegramSofiaGateway.name);
  private offset = 0;
  private readonly adminUserIds = [7276654069];

  constructor(
    private geminiService: GeminiService, 
  ) {}

  async onModuleInit() {
    this.logger.log('Sofía despertando...');
    this.pollMessages();

  }

  async pollMessages() {
    while (true) {
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
    try {
      await axios.post(`${this.apiUrl}/sendMessage`, { chat_id, text, ...extra });
    } catch (e) {
      this.logger.error('Error enviando mensaje', e.message);
    }
  }
}