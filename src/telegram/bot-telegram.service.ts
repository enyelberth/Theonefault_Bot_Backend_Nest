import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { CryptoPriceService } from '../crypto-price/crypto-price.service';
import { TradingService } from 'src/trading/trading.service';
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';

interface ChatState {
  waitingForSymbol?: boolean;
  userId?: number;
  role?: 'admin' | 'user';
}

interface PriceAlert {
  chatId: number;
  symbol: string;
  threshold: number;
  condition: 'arriba' | 'abajo';
}

@Injectable()
export class BotTelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly botToken = '8105793514:AAGjn1pUF2HFSKFe5ZDOofBR8mbv53wvvp4';
  private readonly apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  private readonly logger = new Logger(BotTelegramService.name);
  private offset = 0;
  private chatStates = new Map<number, ChatState>();
  private alerts: PriceAlert[] = [];

  private readonly adminUserIds = [8105793514, 6507628324 /* otros IDs autorizados */];

  constructor(
    private cryptoPrice: CryptoPriceService,
    private tradingService: TradingService,
    private accountService: AccountService,
    private binanceService: BinanceService,
  ) {}

  async onModuleInit() {
    this.logger.log('Iniciando polling para Telegram bot...');
    this.pollMessages();
    setInterval(() => this.checkAlerts(), 60000); // cada 1 minuto (60000 ms)
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
              await this.handleMessage(update.message.chat.id, update.message.text, update.message.from?.id);
            } else if (update.callback_query) {
              await this.handleCallbackQuery(update.callback_query);
            }
          }
        }
      } catch (error) {
        this.logger.error('Error en polling', error);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }

  async handleMessage(chatId: number, text: string, fromUserId?: number) {
    let state = this.chatStates.get(chatId) || {};
    if (!state.userId && fromUserId) {
      state.userId = fromUserId;
      state.role = this.adminUserIds.includes(fromUserId) ? 'admin' : 'user';
      this.chatStates.set(chatId, state);
    }

    if (state.waitingForSymbol) {
      const symbol = text.trim().toUpperCase();
      const price = await this.cryptoPrice.findOne(symbol);
      if (price !== null) {
        await this.sendMessage(chatId, `El precio de ${symbol} es $${price.toFixed(2)}`);
      } else {
        await this.sendMessage(chatId, `No pude encontrar el precio de ${symbol}.`);
      }
      state.waitingForSymbol = false;
      this.chatStates.set(chatId, state);
      return;
    }

    if (text === '/start' || text === '/menu') {
      await this.showMainMenu(chatId, state.role);
      return;
    }

    if (!text.startsWith('/')) {
      await this.sendMessage(chatId, `No entendí "${text}". Usa /menu para opciones.`);
      return;
    }

    const [command, ...args] = text.split(' ');
    switch (command.toLowerCase()) {
      case '/help':
        await this.sendMessage(chatId,
          'Comandos:\n' +
          '/menu - Mostrar menú\n' +
          '/precios - Precios criptos\n' +
          '/preciomoneda - Precio moneda\n' +
          '/alerta [símbolo] [precio] [arriba|abajo] - Crear alerta\n' +
          '/cuentas - Mis cuentas\n' +
          '/cuenta [id] - Detalles cuenta\n' +
          (state.role === 'admin' ? '/actualizarsaldo [id] [moneda] [saldo] - Actualizar saldo\n' : '') +
          '/echo - Repetir texto'
        );
        break;

      case '/echo':
        await this.sendMessage(chatId, args.join(' ') || 'No enviaste texto');
        break;

      case '/precios':
        await this.handleShowPrices(chatId);
        break;

      case '/preciomoneda':
        state.waitingForSymbol = true;
        this.chatStates.set(chatId, state);
        await this.sendMessage(chatId, 'Escribe símbolo de moneda (ejemplo BTCUSDT)');
        break;

      case '/alerta':
        await this.handleCreateAlert(chatId, args);
        break;

      case '/cuentas':
        await this.handleListAccounts(chatId);
        break;

      case '/cuenta':
        if (args.length !== 1 || isNaN(Number(args[0]))) {
          await this.sendMessage(chatId, 'Uso: /cuenta [id]');
        } else {
          await this.handleShowAccountDetails(chatId, Number(args[0]));
        }
        break;

      case '/actualizarsaldo':
        if (state.role !== 'admin') {
          await this.sendMessage(chatId, 'No tienes permiso para actualizar saldo');
          return;
        }
        if (args.length !== 3 || isNaN(Number(args[0])) || isNaN(Number(args[2]))) {
          await this.sendMessage(chatId, 'Uso: /actualizarsaldo [id] [moneda] [saldo]');
        } else {
          const accountId = Number(args[0]);
          const currencyCode = args[1].toUpperCase();
          const newBalance = Number(args[2]);
          await this.handleUpdateBalance(chatId, accountId, currencyCode, newBalance);
        }
        break;

      default:
        await this.sendMessage(chatId, `Comando "${command}" no reconocido. Usa /menu.`);
        break;
    }
  }

  private async showMainMenu(chatId: number, role: 'admin' | 'user' = 'user') {
    const buttons = [
      [{ text: 'Precios Criptos', callback_data: 'show_prices' }],
      [{ text: 'Precio Moneda', callback_data: 'ask_symbol' }],
      [{ text: 'Crear Alerta', callback_data: 'create_alert' }],
      [{ text: 'Mis Cuentas', callback_data: 'list_accounts' }],
    ];
    if (role === 'admin') {
      buttons.push([{ text: 'Actualizar Saldo', callback_data: 'update_balance' }]);
    }
    buttons.push([{ text: 'Ayuda', callback_data: 'help' }]);

    await this.sendMessage(chatId, '<b>Menú Principal</b> Selección:', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  async handleCallbackQuery(callbackQuery: any) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    switch (data) {
      case 'show_prices':
        await this.handleShowPrices(chatId);
        break;
      case 'ask_symbol':
        const state = this.chatStates.get(chatId) || {};
        state.waitingForSymbol = true;
        this.chatStates.set(chatId, state);
        await this.sendMessage(chatId, 'Escribe el símbolo de moneda (ejemplo BTCUSDT)');
        break;
      case 'create_alert':
        await this.sendMessage(chatId, 'Usa comando /alerta [símbolo] [precio] [arriba|abajo]');
        break;
      case 'list_accounts':
        await this.handleListAccounts(chatId);
        break;
      case 'update_balance':
        await this.sendMessage(chatId, 'Comando admin: /actualizarsaldo [id] [moneda] [saldo]');
        break;
      case 'help':
        await this.sendMessage(chatId, 'Usa /menu para opciones disponibles');
        break;
      default:
        await this.sendMessage(chatId, 'Opción no reconocida');
    }
    await axios.post(`${this.apiUrl}/answerCallbackQuery`, { callback_query_id: callbackQuery.id });
  }

  private async handleShowPrices(chatId: number) {
    const prices = await this.cryptoPrice.findAll();
    if (!prices.length) {
      await this.sendMessage(chatId, 'No hay datos de precios.');
      return;
    }
    const msg = prices.map(p => `${p.symbol}: $${p.price.toFixed(2)}`).join('\n');
    await this.sendMessage(chatId, `Precios actuales:\n${msg}`);
  }

  private async handleCreateAlert(chatId: number, args: string[]) {
    if (args.length !== 3) {
      await this.sendMessage(chatId, 'Uso: /alerta [símbolo] [precio] [arriba|abajo]');
      return;
    }
    const symbol = args[0].toUpperCase();
    const threshold = Number(args[1]);
    const condition = args[2];
    if (isNaN(threshold) || (condition !== 'arriba' && condition !== 'abajo')) {
      await this.sendMessage(chatId, 'Formato incorrecto.');
      return;
    }
    this.alerts.push({ chatId, symbol, threshold, condition: condition as 'arriba' | 'abajo' });
    await this.sendMessage(chatId, `Alerta creada para ${symbol} ${condition} $${threshold}`);
  }

  private async handleListAccounts(chatId: number) {
    try {
      const accounts = await this.accountService.findAll();
      if (!accounts.length) {
        await this.sendMessage(chatId, 'No tienes cuentas.');
        return;
      }
      const msg = accounts.map(a => `ID: ${a.id}, Email: ${a.email}`).join('\n');
      await this.sendMessage(chatId, `Tus cuentas:\n${msg}`);
    } catch {
      await this.sendMessage(chatId, 'Error obteniendo cuentas.');
    }
  }

  private async handleShowAccountDetails(chatId: number, id: number) {
    try {
      const account = await this.accountService.findOneWithBalance(id);
      let balances = 'Saldos:\n';
      for (const bal of account.accountBalances) {
        balances += `- ${bal.currencyCode}: ${bal.balance}\n`;
      }
      await this.sendMessage(chatId,
        `Cuenta ID ${account.id}\nEmail: ${account.email}\nTipo: ${account.bankAccountType?.typeName}\n${balances}`
      );
    } catch {
      await this.sendMessage(chatId, `Cuenta no encontrada: ID ${id}`);
    }
  }

  private async handleUpdateBalance(chatId: number, accountId: number, currencyCode: string, newBalance: number) {
    try {
      const res = await this.accountService.updateCryptoBalance(accountId, currencyCode, newBalance);
      await this.sendMessage(chatId, `Saldo actualizado: Cuenta ${accountId}, ${currencyCode} = ${res.balance}`);
    } catch (e) {
      await this.sendMessage(chatId, `Error: ${e.message || e.toString()}`);
    }
  }

  async checkAlerts() {
    for (const alert of [...this.alerts]) {
      const price = await this.cryptoPrice.findOne(alert.symbol);
      if (price === null) continue;

      if ((alert.condition === 'arriba' && price >= alert.threshold) ||
          (alert.condition === 'abajo' && price <= alert.threshold)) {
        await this.sendMessage(alert.chatId,
          `Alerta: ${alert.symbol} está ${alert.condition} de $${alert.threshold}. Precio actual: $${price.toFixed(2)}`
        );
        this.alerts = this.alerts.filter(a => a !== alert);
      }
    }
  }

  async sendMessage(chatId: number, text: string, options = {}): Promise<void> {
    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        ...options,
      });
      this.logger.log(`Mensaje enviado a ${chatId}: ${text}`);
    } catch (error) {
      this.logger.error('Error enviando mensaje', error);
    }
  }
}
