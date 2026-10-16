import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
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

@Injectable()
export class BotTelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  private readonly apiUrl = `https://api.telegram.org/bot${this.botToken}`;
  private readonly logger = new Logger(BotTelegramService.name);
  private offset = 0;
  private chatStates = new Map<number, ChatState>();

  private readonly adminUserIds = BotTelegramService.parseIdList(
    process.env.TELEGRAM_ADMIN_IDS,
    [7276654069],
  );
  private readonly notifyChats = BotTelegramService.parseIdList(
    process.env.TELEGRAM_NOTIFY_CHAT_IDS,
    [7276654069],
  );

  private readonly pnlAlertThresholdUsd =
    Number(process.env.PNL_ALERT_THRESHOLD_USD) > 0
      ? Number(process.env.PNL_ALERT_THRESHOLD_USD)
      : 1;
  private lastKnownPnl: number | null = null;

  private static parseIdList(raw: string | undefined, fallback: number[]) {
    if (!raw) return fallback;
    const ids = raw
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    return ids.length ? ids : fallback;
  }

  private isAdmin(userId?: number): boolean {
    return userId !== undefined && this.adminUserIds.includes(userId);
  }

  private describeError(error: any): string {
    return (
      error?.response?.data?.description ??
      error?.response?.data ??
      error?.message ??
      String(error)
    );
  }

  constructor(
    private cryptoPrice: CryptoPriceService,
    private tradingService: TradingService,
    private accountService: AccountService,
    private binanceService: BinanceService,
    private botService: BotService,
    private alertService: AlertService,
  ) {}

  async onModuleInit() {
    if (!this.botToken) {
      this.logger.error(
        'TELEGRAM_BOT_TOKEN no configurado; bot de Telegram deshabilitado.',
      );
      return;
    }
    this.logger.log('Iniciando polling para Telegram bot...');
    await this.ensureWebhookDeleted();
    await this.discardPendingUpdates();
    this.pollMessages();
    setInterval(() => this.checkAlerts(), 60000);
    setInterval(() => this.checkPnlAlert(), 30000);
  }

  private async discardPendingUpdates(): Promise<void> {
    try {
      const res = await axios.get(`${this.apiUrl}/getUpdates`, {
        params: { timeout: 0 },
      });
      const results = res.data?.result ?? [];
      if (results.length) {
        this.offset = results[results.length - 1].update_id;
        this.logger.warn(
          `${results.length} updates pendientes descartados al arrancar (evita reejecutar comandos viejos).`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo descartar backlog de updates: ${this.describeError(error)}`,
      );
    }
  }

  private async ensureWebhookDeleted(): Promise<void> {
    try {
      const res = await axios.get(`${this.apiUrl}/deleteWebhook`, {
        params: { drop_pending_updates: false },
      });
      this.logger.log(
        `deleteWebhook ok=${res.data?.ok} desc=${res.data?.description ?? ''}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `deleteWebhook failed: ${err?.response?.data?.description ?? err.message}`,
      );
    }
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
              await this.handleMessage(
                update.message.chat.id,
                update.message.text,
                update.message.from?.id,
              );
            } else if (update.callback_query) {
              await this.handleCallbackQuery(update.callback_query);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error en polling: ${this.describeError(error)}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async handleMessage(chatId: number, text: string, fromUserId?: number) {
    this.logger.log(
      `Mensaje de userId=${fromUserId} chatId=${chatId}: ${text}`,
    );
    const state = this.chatStates.get(chatId) || {};
    if (!state.userId && fromUserId) {
      state.userId = fromUserId;
      state.role = this.adminUserIds.includes(fromUserId) ? 'admin' : 'user';
      this.chatStates.set(chatId, state);
    }

    if (state.waitingForSymbol && text.startsWith('/')) {
      state.waitingForSymbol = false;
      this.chatStates.set(chatId, state);
    }

    if (state.waitingForSymbol) {
      const symbol = text.trim().toUpperCase();
      const price = await this.cryptoPrice.findOne(symbol);
      if (price !== null) {
        await this.sendMessage(
          chatId,
          `El precio de ${symbol} es $${price.toFixed(2)}`,
        );
      } else {
        await this.sendMessage(
          chatId,
          `No pude encontrar el precio de ${symbol}.`,
        );
      }
      state.waitingForSymbol = false;
      this.chatStates.set(chatId, state);
      return;
    }

    if (text.startsWith('/crear_estrategia_json')) {
      if (!this.isAdmin(fromUserId)) {
        await this.sendMessage(chatId, 'No tienes permiso para este comando.');
        return;
      }
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
      await this.sendMessage(
        chatId,
        `No entendí "${text}". Usa /menu para opciones.`,
      );
      return;
    }

    const [command, ...args] = text.split(' ');
    switch (command.toLowerCase()) {
      case '/help':
        await this.sendMessage(
          chatId,
          'Comandos:\n' +
            '/menu - Mostrar menú\n' +
            '/crear_estrategia - Crear estrategia\n' +
            '/alertadelete - Delete Alerta\n' +
            '/stop_estrategia - Uso: /detener estrategia [symbol] [id]\n' +
            '/add_level - add_level XRPFDUSD er10 1.85 3\n' +
            '/precios - Precios criptos\n' +
            '/preciomoneda - Precio moneda\n' +
            '/alerta [símbolo] [precio] [arriba|abajo] - Crear alerta\n' +
            '/cuentas - Mis cuentas\n' +
            '/cuenta [id] - Detalles cuenta\n' +
            '/Prueba - Prueba\n' +
            '/alertas - Mostrar alertas activas\n' +
            '/estrategias - Mostrar estrategias activas\n' +
            '/limpiarchat - Mostrar estrategias activas\n' +
            (state.role === 'admin'
              ? '/actualizarsaldo [id] [moneda] [saldo] - Actualizar saldo\n'
              : '') +
            '/echo - Repetir texto',
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
        await this.sendMessage(
          chatId,
          'Escribe símbolo de moneda (ejemplo BTCUSDT)',
        );
        break;

      case '/alerta':
        await this.handleCreateAlert(chatId, args);
        break;

      case '/fondo':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
        await this.handleFondo(chatId);
        break;

      case '/alertadelete':
        await this.handleDeleteAlert(chatId, args, fromUserId);
        break;

      case '/estrategias':
        await this.handleShowStrategies(chatId, args);
        break;

      case '/cuentas':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
        await this.handleListAccounts(chatId);
        break;
      case '/alertas':
        await this.handleShowAlerts(chatId, fromUserId);
        break;

      case '/cuenta':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
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
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
        await this.handleCreateStrategy(chatId, args);
        break;
      case '/add_level':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
        await this.handleAddLevelStrategy(chatId, args);
        break;
      case '/stop_estrategia':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
        if (args.length !== 2) {
          await this.sendMessage(
            chatId,
            'Uso: /detener estrategia [symbol] [id]',
          );
          break;
        }
        try {
          const [symbol, id] = args;
          await this.botService.stopStrategy(symbol, id);
          await this.sendMessage(
            chatId,
            `Estrategia detenida: ${id} para ${symbol}`,
          );
        } catch (error) {
          await this.sendMessage(
            chatId,
            'Error deteniendo estrategia: ' + (error as Error).message,
          );
        }
        break;
      case '/reset':
        await this.sendMessage(chatId, 'Uso: /reset');
        break;
      case '/prueba':
        await this.sendMessage(chatId, 'Uso: /prueba');

        break;

      case '/actualizarsaldo':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(
            chatId,
            'No tienes permiso para actualizar saldo',
          );
          break;
        }
        if (
          args.length !== 3 ||
          isNaN(Number(args[0])) ||
          isNaN(Number(args[2]))
        ) {
          await this.sendMessage(
            chatId,
            'Uso: /actualizarsaldo [id] [moneda] [saldo]',
          );
        } else {
          const accountId = Number(args[0]);
          const currencyCode = args[1].toUpperCase();
          const newBalance = Number(args[2]);
          await this.handleUpdateBalance(
            chatId,
            accountId,
            currencyCode,
            newBalance,
          );
        }
        break;

      default:
        await this.sendMessage(
          chatId,
          `Comando "${command}" no reconocido. Usa /menu.`,
        );
        break;
    }
  }
  private async handleCreateStrategy(chatId: number, args: string[]) {
    if (args.length < 4) {
      await this.sendMessage(
        chatId,
        'Uso: /crear_estrategia [symbol] [typeId] [strategyType] [id] [configJsonOpcional]',
      );
      return;
    }
    try {
      const [symbol, typeIdStr, strategyType, id, ...configParts] = args;
      const typeId = parseInt(typeIdStr);
      const configJson = configParts.join(' ');
      const config = configJson ? JSON.parse(configJson) : {};
      this.botService.startStrategy(symbol, typeId, strategyType, config, id);
      await this.sendMessage(
        chatId,
        `Estrategia creada y arrancada: ${id} para ${symbol}`,
      );
    } catch (error) {
      await this.sendMessage(
        chatId,
        'Error creando estrategia: ' + (error as Error).message,
      );
    }
  }

  private async handleAddLevelStrategy(chatId: number, args: string[]) {
    const [symbol, id, priceRaw, amountRaw] = args;

    if (!symbol || !id || !priceRaw || !amountRaw) {
      return await this.sendMessage(
        chatId,
        ' Formato incompleto. Uso: `/add_level XRPFDUSD er10 1.85 3`',
      );
    }

    const price = parseFloat(priceRaw);
    const quantity = parseFloat(amountRaw);

    if (isNaN(price) || isNaN(quantity)) {
      return await this.sendMessage(
        chatId,
        '❌ El precio y la cantidad deben ser números válidos.',
      );
    }

    try {
      const success = await this.botService.addOrderLevel(
        id,
        symbol.toUpperCase(),
        {
          price,
          quantity,
        },
      );

      if (success) {
        await this.sendMessage(
          chatId,
          ` ¡Nivel agregado!\nSímbolo: ${symbol}\nPrecio: ${price}\nCant: ${quantity}`,
        );
      } else {
        await this.sendMessage(
          chatId,
          ` No se encontró la estrategia con ID: ${id}`,
        );
      }
    } catch (error) {
      console.error('Error en addLevel:', error);
      await this.sendMessage(chatId, ' Error interno al guardar el nivel.');
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
        await this.sendMessage(
          chatId,
          'JSON inválido. Debe contener id, typeId, symbol, strategyType y config.',
        );
        return;
      }

      await this.botService.startStrategy(
        symbol,
        typeId,
        strategyType,
        config,
        id,
      );
      await this.sendMessage(
        chatId,
        `Estrategia creada y arrancada: ${id} para ${symbol}`,
      );
    } catch (error) {
      await this.sendMessage(
        chatId,
        'Error procesando el JSON: ' + (error as Error).message,
      );
    }
  }
  private async showMainMenu(chatId: number, role: 'admin' | 'user' = 'user') {
    const buttons = [
      [{ text: 'Precios Criptos', callback_data: 'show_prices' }],
      [{ text: 'Precio Moneda', callback_data: 'ask_symbol' }],
      [{ text: 'Crear Alerta', callback_data: 'create_alert' }],
      [{ text: 'Mis Cuentas', callback_data: 'list_accounts' }],
      [{ text: 'Estrategias', callback_data: 'list_strategies' }],
      [{ text: 'Start Estrategias', callback_data: 'start_strategy' }],
    ];
    if (role === 'admin') {
      buttons.push([
        { text: 'Actualizar Saldo', callback_data: 'update_balance' },
      ]);
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

    await this.sendMessage(
      chatId,
      'Toda tu información y alertas en este chat han sido borradas de nuestro sistema.',
    );
  }
  async handleFondo(chatId: number) {
    try {
      const data = await this.binanceService.getCrossMarginPNLSummary();
      const precio = data?.totalUnrealizedPNL;
      const precioBTC = await this.cryptoPrice.findOne('BTCFDUSD');
      const e = Number(precio) * Number(precioBTC);
      await this.sendMessage(
        chatId,
        `Uso: /fondo\nPrecio: ${precio}\nPrecio BTC: ${precioBTC}\nEquivalente en BTC: ${e}`,
      );
    } catch (err) {
      await this.sendMessage(
        chatId,
        `No disponible: ${(err as Error).message}`,
      );
    }
  }

  async handleCallbackQuery(callbackQuery: any) {
    const chatId = callbackQuery.message.chat.id;
    const fromUserId = callbackQuery.from?.id;
    const data = callbackQuery.data;
    switch (data) {
      case 'show_prices':
        await this.handleShowPrices(chatId);
        break;
      case 'ask_symbol':
        const state = this.chatStates.get(chatId) || {};
        state.waitingForSymbol = true;
        this.chatStates.set(chatId, state);
        await this.sendMessage(
          chatId,
          'Escribe el símbolo de moneda (ejemplo BTCUSDT)',
        );
        break;
      case 'create_alert':
        await this.sendMessage(
          chatId,
          'Usa comando /alerta [símbolo] [precio] [arriba|abajo]',
        );
        break;
      case 'list_accounts':
        if (!this.isAdmin(fromUserId)) {
          await this.sendMessage(chatId, 'No tienes permiso para este comando.');
          break;
        }
        await this.handleListAccounts(chatId);
        break;
      case 'list_strategies':
        await this.handleShowStrategies(chatId, []);
        break;
      case 'start_strategy':
        await this.sendMessage(chatId, 'Strategia iniciada');
        break;
      case 'delete_alert':
        await this.handleDeleteAlert(chatId, []);

        //await this.sendMessage(chatId, msg);
        //  await this.handleShowStrategies(chatId);
        break;
      case 'update_balance':
        await this.sendMessage(
          chatId,
          'Comando admin: /actualizarsaldo [id] [moneda] [saldo]',
        );
        break;

      case 'help':
        await this.sendMessage(chatId, 'Usa /menu para opciones disponibles');
        break;
      default:
        await this.sendMessage(chatId, 'Opción no reconocida');
    }
    await axios.post(`${this.apiUrl}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id,
    });
  }

  private async handleShowPrices(chatId: number) {
    const prices = await this.cryptoPrice.findAll();
    if (!prices.length) {
      await this.sendMessage(chatId, 'No hay datos de precios.');
      return;
    }
    const msg = prices
      .map((p) => `${p.symbol}: $${p.price.toFixed(2)}`)
      .join('\n');
    await this.sendMessage(chatId, `Precios actuales:\n${msg}`);
  }
  private async handleShowAlerts(chatId: number, fromUserId?: number) {
    const all = await this.alertService.getAlerts();
    const alerts = this.isAdmin(fromUserId)
      ? all
      : all.filter((a) => a.chatId !== null && Number(a.chatId) === chatId);
    if (!alerts.length) {
      await this.sendMessage(chatId, 'No tienes alertas activas.');
      return;
    }
    const msg = alerts
      .map((a) => `${a.id}- ${a.symbol}: ${a.price} $${a.up_down}`)
      .join('\n');
    await this.sendMessage(chatId, `Tus alertas activas:\n${msg}`);
  }

  private async handleCreateAlert(chatId: number, args: string[]) {
    if (args.length !== 3) {
      await this.sendMessage(
        chatId,
        'Uso: /alerta [símbolo] [precio] [up|down]',
      );
      return;
    }
    const symbol = args[0].toUpperCase();
    const threshold = Number(args[1]);
    const condition = args[2];
    if (isNaN(threshold) || (condition !== 'up' && condition !== 'down')) {
      await this.sendMessage(chatId, 'Formato incorrecto.');
      return;
    }
    await this.alertService.createAlertPrice(
      symbol,
      threshold,
      condition,
      chatId,
    );
    await this.sendMessage(
      chatId,
      `Alerta creada para ${symbol} ${condition} $${threshold}`,
    );
  }
  private async handleDeleteAlert(
    chatId: number,
    args: string[],
    fromUserId?: number,
  ) {
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
      const alert = await this.alertService.getOneAlert(alertId);
      const ownsAlert =
        alert.chatId === null || Number(alert.chatId) === chatId;
      if (!ownsAlert && !this.isAdmin(fromUserId)) {
        await this.sendMessage(
          chatId,
          'Esa alerta no te pertenece, no puedes borrarla.',
        );
        return;
      }
      await this.alertService.deleteAlert(alertId);
      await this.sendMessage(chatId, `Alerta eliminada: ${alertId}`);
    } catch (error) {
      await this.sendMessage(
        chatId,
        `Error eliminando alerta: ${(error as Error).message}`,
      );
    }
  }

  private async handleShowStrategies(chatId: number, args: string[]) {
    const data = this.botService.getActiveBots();
    let msg;
    if (data.length > 0) {
      // Mapea cada estrategia a un string y luego une con salto de línea
      msg = data.map((p) => `${p}`).join('\n');
    } else {
      msg = 'No hay estrategias activas';
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
      const msg = accounts
        .map((a) => `ID: ${a.id}, Email: ${a.email}`)
        .join('\n');
      await this.sendMessage(chatId, `Tus cuentas:\n${msg}`);
    } catch {
      await this.sendMessage(chatId, 'Error obteniendo cuentas.');
    }
  }

  private async handleShowAccountDetails(chatId: number, id: number) {
    try {
      const basicAccount = await this.accountService.findOne(id);
      const account = await this.accountService.findOneWithBalance(
        id,
        basicAccount.userId,
      );
      let balances = 'Saldos:\n';
      for (const bal of account.accountBalances) {
        balances += `- ${bal.currencyCode}: ${bal.balance}\n`;
      }
      await this.sendMessage(
        chatId,
        `Cuenta ID ${account.id}\nEmail: ${account.email}\nTipo: ${account.bankAccountType?.typeName}\n${balances}`,
      );
    } catch {
      await this.sendMessage(chatId, `Cuenta no encontrada: ID ${id}`);
    }
  }

  private async handleUpdateBalance(
    chatId: number,
    accountId: number,
    currencyCode: string,
    newBalance: number,
  ) {
    try {
      const basicAccount = await this.accountService.findOne(accountId);
      const res = await this.accountService.updateCryptoBalance(
        accountId,
        currencyCode,
        newBalance,
        basicAccount.userId,
      );
      await this.sendMessage(
        chatId,
        `Saldo actualizado: Cuenta ${accountId}, ${currencyCode} = ${res.balance}`,
      );
    } catch (e) {
      await this.sendMessage(chatId, `Error: ${e.message || e.toString()}`);
    }
  }

  async checkAlerts() {
    const alertas = await this.alertService.getAlerts();
    for (const alert of alertas) {
      const price = await this.cryptoPrice.findOne(alert.symbol);
      if (price === null) continue;

      const triggered =
        (alert.up_down === 'up' && price >= alert.price) ||
        (alert.up_down === 'down' && price <= alert.price);
      if (!triggered) continue;

      const targetChatIds = alert.chatId
        ? [Number(alert.chatId)]
        : this.adminUserIds;
      for (const chatId of targetChatIds) {
        await this.sendMessage(
          chatId,
          `Alerta: ${alert.symbol} está ${alert.up_down} de $${alert.price}. Precio actual: $${price.toFixed(4)}`,
        );
      }

      try {
        await this.alertService.deleteAlert(alert.id);
      } catch (error) {
        this.logger.error(
          `No se pudo borrar alerta ${alert.id} tras dispararse: ${this.describeError(error)}`,
        );
      }
    }
  }

  async checkPnlAlert() {
    try {
      const data = await this.binanceService.getCrossMarginPNLSummary();
      const pnl = Number(data?.totalUnrealizedPNL);
      if (!Number.isFinite(pnl)) return;

      if (this.lastKnownPnl === null) {
        this.lastKnownPnl = pnl;
        return;
      }

      const delta = pnl - this.lastKnownPnl;
      if (Math.abs(delta) >= this.pnlAlertThresholdUsd) {
        const sign = delta >= 0 ? '+' : '';
        for (const chatId of this.notifyChats) {
          await this.sendMessage(
            chatId,
            `PnL no realizado cambió ${sign}$${delta.toFixed(2)} (de $${this.lastKnownPnl.toFixed(2)} a $${pnl.toFixed(2)}).`,
          );
        }
        this.lastKnownPnl = pnl;
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo evaluar alerta de PnL: ${this.describeError(error)}`,
      );
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
      this.logger.error(
        `Error enviando mensaje a ${chatId}: ${this.describeError(error)}`,
      );
    }
  }
}
