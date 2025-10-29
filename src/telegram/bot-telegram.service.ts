import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { CryptoPriceService } from '../crypto-price/crypto-price.service';
import { TradingService } from 'src/trading/trading.service';
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';
import { BotService } from 'src/bot/bot.service';
import { AlertService } from 'src/alert/alert.service';

interface ChatState {
  waitingForSymbol?: boolean;
  userId?: number;
  role?: 'admin' | 'user';
}

interface PriceAlert {
  chatId: number;
  symbol: string;
  threshold: number;
  condition: 'up' | 'down';
}

@Injectable()
export class BotTelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly botToken = '8314324600:AAHxwt3fUaP3-XNuq4jgdWPDxN6IC0UNTHY';
  private readonly apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  private readonly logger = new Logger(BotTelegramService.name);
  private offset = 0;
  private chatStates = new Map<number, ChatState>();
  private alerts: PriceAlert[] = [];

  private readonly adminUserIds = [8105793514, 6507628324 /* otros IDs autorizados */];
  private readonly notifyChats = [8105793514, 6507628324];

  constructor(
    private cryptoPrice: CryptoPriceService,
    private tradingService: TradingService,
    private accountService: AccountService,
    private binanceService: BinanceService,
    private botService: BotService,
    private alertService: AlertService,
  ) { }

  async onModuleInit() {
    this.logger.log('Iniciando polling para Telegram bot...');
    this.pollMessages();
    setInterval(() => this.checkAlerts(), 60000); // cada 1 minuto (60000 ms)

   // setInterval(() => this.notifyCertainNumbersPrecios(), 240000);

  }

  async onModuleDestroy() {
    this.logger.log('Deteniendo bot...');
  }
  async notifyCertainNumbersPrecios() {
    for (const chatId of this.notifyChats) {
      await this.handleShowPrices(chatId);
      //await this.sendMessage(chatId, 'Mensaje personalizado cada minuto.');
    }
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


    if (text.startsWith('/crear_estrategia_json')) {
      // Separar el texto después del comando como JSON
      const jsonString = text.replace('/crear_estrategia_json', '').trim();
      this.handleCreateStrategyFromJson(chatId, jsonString);
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
          '/Prueba - Prueba\n' +
          '/alertas - Mostrar alertas activas\n' +
          '/estrategias - Mostrar estrategias activas\n' +
          '/limpiarchat - Mostrar estrategias activas\n' +
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

      case '/fondo':
        await this.handleFondo(chatId);
        break;

      case '/alertadelete':
        await this.handleDeleteAlert(chatId, args);
        break;

      case '/estrategias':
        await this.handleShowStrategies(chatId, args);
        break;

      case '/cuentas':
        await this.handleListAccounts(chatId);
        break;
      case '/alertas':
        await this.handleShowAlerts(chatId);
        break;

      case '/cuenta':
        if (args.length !== 1 || isNaN(Number(args[0]))) {
          await this.sendMessage(chatId, 'Uso: /cuenta [id]');
        } else {
          await this.handleShowAccountDetails(chatId, Number(args[0]));
        }

        break;
      case '/limpiarchat':
        await this.clearChatData(chatId);
        break;
      case '/crear_estrategia':
        await this.handleCreateStrategy(chatId, args);
        break;
      case '/stop_estrategia':
        if (args.length !== 2) {
          await this.sendMessage(chatId, 'Uso: /detener estrategia [symbol] [id]');
          break;
        }
        try {
          const [symbol, id] = args;
          await this.botService.stopStrategy(symbol, id);
          await this.sendMessage(chatId, `Estrategia detenida: ${id} para ${symbol}`);
        } catch (error) {
          await this.sendMessage(chatId, 'Error deteniendo estrategia: ' + (error as Error).message);
        }
        break;
      case '/reset':
        await this.sendMessage(chatId, 'Uso: /reset');
        break;
      case '/prueba':
        await this.sendMessage(chatId, 'Uso: /prueba');

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
  private async handleCreateStrategy(
    chatId: number,
    args: string[],
  ) {
    if (args.length < 4) {
      await this.sendMessage(chatId, 'Uso: /crear_estrategia [symbol] [typeId] [strategyType] [id] [configJsonOpcional]');
      return;
    }
    try {
      const [symbol, typeIdStr, strategyType, id, ...configParts] = args;
      const typeId = parseInt(typeIdStr);
      const configJson = configParts.join(' ');
      const config = configJson ? JSON.parse(configJson) : {};
      await this.botService.startStrategy(symbol, typeId, strategyType, config, id);
      await this.sendMessage(chatId, `Estrategia creada y arrancada: ${id} para ${symbol}`);
    } catch (error) {
      await this.sendMessage(chatId, 'Error creando estrategia: ' + (error as Error).message);
    }
  }

  private async handleCreateStrategyFromJson(
    chatId: number,
    jsonString: string,
  ) {
    try {
      const strategyData = JSON.parse(jsonString);
      const { id, typeId, symbol, strategyType, config } = strategyData;

      if (!id || !typeId || !symbol || !strategyType || !config) {
        await this.sendMessage(chatId, 'JSON inválido. Debe contener id, typeId, symbol, strategyType y config.');
        return;
      }

      await this.botService.startStrategy(symbol, typeId, strategyType, config, id);
      await this.sendMessage(chatId, `Estrategia creada y arrancada: ${id} para ${symbol}`);
    } catch (error) {
      await this.sendMessage(chatId, 'Error procesando el JSON: ' + (error as Error).message);
    }
  }
  private async showMainMenu(chatId: number, role: 'admin' | 'user' = 'user') {
    const buttons = [
      [{ text: 'Precios Criptos', callback_data: 'show_prices' }],
      [{ text: 'Precio Moneda', callback_data: 'ask_symbol' }],
      [{ text: 'Crear Alerta', callback_data: 'create_alert' }],
      [{ text: 'Mis Cuentas', callback_data: 'list_accounts' }],
      [{ text: 'Estrategias', callback_data: 'list_strategies' }],
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
  async clearChatData(chatId: number) {
    // Elimina el estado guardado en memoria
    this.chatStates.delete(chatId);

    // Elimina alertas que pertenezcan a este chat
    this.alerts = this.alerts.filter(alert => alert.chatId !== chatId);

    // Si tienes otros datos almacenados por chat, elimínalos aquí también

    await this.sendMessage(chatId, 'Toda tu información y alertas en este chat han sido borradas de nuestro sistema.');
  }
  async handleFondo(chatId: number) {
      let data  = await this.binanceService.getCrossMarginPNLSummary();
    const precio = data?.totalUnrealizedPNL;
    const precioBTC = await this.cryptoPrice.findOne('BTCFDUSD');
    const e = Number(precio) * Number(precioBTC);
    await this.sendMessage(chatId, `Uso: /fondo\nPrecio: ${precio}\nPrecio BTC: ${precioBTC}\nEquivalente en BTC: ${e}`);
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
      case 'list_strategies':
           const data = this.botService.getActiveBots();
    let msg;
    if (data.length > 0) {
      // Mapea cada estrategia a un string y luego une con salto de línea
      msg = data.map(p => `${p}`).join('\n');
    } else {
      msg = "No hay estrategias activas";
    }
      case 'delete_alert':
        await this.handleDeleteAlert(chatId, []);
        break;

    await this.sendMessage(chatId, msg);
      //  await this.handleShowStrategies(chatId);
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
  private async handleShowAlerts(chatId: number) {
    const alerts = await this.alertService.getAlerts();
    if (!alerts.length) {
      await this.sendMessage(chatId, 'No tienes alertas activas.');
      return;
    }
    const msg = alerts.map(a => `${a.id}- ${a.symbol}: ${a.price} $${a.up_down}`).join('\n');
    await this.sendMessage(chatId, `Tus alertas activas:\n${msg}`);
  }

  private async handleCreateAlert(chatId: number, args: string[]) {
    if (args.length !== 3) {
      await this.sendMessage(chatId, 'Uso: /alerta [símbolo] [precio] [up|down]');
      return;
    }
    const symbol = args[0].toUpperCase();
    const threshold = Number(args[1]);
    const condition = args[2];
    if (isNaN(threshold) || (condition !== 'up' && condition !== 'down')) {
      await this.sendMessage(chatId, 'Formato incorrecto.');
      return;
    }
    this.alerts.push({ chatId, symbol, threshold, condition: condition as 'up' | 'down' });

   await this.alertService.createAlertPrice(symbol, threshold, condition as 'up' | 'down');
    await this.sendMessage(chatId, `Alerta creada para ${symbol} ${condition} $${threshold}`);
  }
private async handleDeleteAlert(chatId: number, args: string[]) {
  // Se espera que args contenga solo el ID de la alerta, por ejemplo: ['/alertaDelete', '123'] → args = ['123']
  if (args.length !== 1) {
    await this.sendMessage(chatId, 'Uso: /alertaDelete [id]');
    return;
  }
  const alertId = Number(args[0]);
  if (isNaN(alertId)) {
    await this.sendMessage(chatId, 'ID de alerta inválido.');
    return;
  }
  try {
    await this.alertService.deleteAlert(alertId);
    await this.sendMessage(chatId, `Alerta eliminada: ${alertId}`);
  } catch (error) {
    await this.sendMessage(chatId, `Error eliminando alerta: ${(error as Error).message}`);
  }
}


  private async handleShowStrategies(chatId: number, args: string[]) {

    const data = this.botService.getActiveBots();
    let msg;
    if (data.length > 0) {
      // Mapea cada estrategia a un string y luego une con salto de línea
      msg = data.map(p => `${p}`).join('\n');
    } else {
      msg = "No hay estrategias activas";
    }

    await this.sendMessage(chatId, msg);
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

    const alertas = await this.alertService.getAlerts();
    for (const alert of alertas) {
      const price = await this.cryptoPrice.findOne(alert.symbol);
      if (price === null) continue;

      if ((alert.up_down === 'up' && price >= alert.price) ||
        (alert.up_down === 'down' && price <= alert.price)) {


        this.adminUserIds.forEach(async (chatId) => {
          await this.sendMessage(chatId,
            `Alerta: ${alert.symbol} está ${alert.up_down} de $${alert.price}. Precio actual: $${price.toFixed(4)}`
          );
        });
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
