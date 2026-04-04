import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { CryptoPriceService } from '../crypto-price/crypto-price.service';
import { TradingService } from 'src/trading/trading.service';
import { AccountService } from 'src/account/account.service';
import { BinanceService } from 'src/binance/binance.service';
import { BotService } from 'src/bot/bot.service';
import { AlertService } from 'src/alert/alert.service';
import { StrategyOpsService } from 'src/strategy-monitoring/strategy-ops.service';

interface ChatState {
  waitingForSymbol?: boolean;
  waitingForPanicStrategyId?: boolean;
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
  private readonly botToken = process.env.BOOT ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  private readonly apiUrl = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : '';
  private readonly logger = new Logger(BotTelegramService.name);
  private offset = 0;
  private chatStates = new Map<number, ChatState>();
  private alerts: PriceAlert[] = [];
  private isPolling = false;
  private alertIntervalRef?: NodeJS.Timeout;
  private riskEventIntervalRef?: NodeJS.Timeout;
  private readonly notifiedRiskEvents = new Set<string>();

  private readonly adminUserIds = this.readNumberList(
    process.env.ADMIN_TELEGRAM_IDS,
    [7276654069],
  );
  private readonly notifyChats = this.readNumberList(
    process.env.NOTIFY_TELEGRAM_CHATS,
    this.adminUserIds,
  );

  constructor(
    private cryptoPrice: CryptoPriceService,
    private tradingService: TradingService,
    private accountService: AccountService,
    private binanceService: BinanceService,
    private botService: BotService,
    private alertService: AlertService,
    private strategyOpsService: StrategyOpsService,
  ) { }

  private readNumberList(rawValue: string | undefined, defaults: number[]): number[] {
    if (!rawValue || rawValue.trim() === '') {
      return defaults;
    }

    const ids = rawValue
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    return ids.length > 0 ? ids : defaults;
  }

  async onModuleInit() {
    if (!this.apiUrl) {
      this.logger.warn('Telegram BOT deshabilitado: falta BOOT/TELEGRAM_BOT_TOKEN en entorno.');
      return;
    }

    this.logger.log('Iniciando polling para Telegram bot...');
    this.isPolling = true;
    void this.pollMessages();
    this.alertIntervalRef = setInterval(() => {
      void this.checkAlerts();
    }, 60000);
    this.riskEventIntervalRef = setInterval(() => {
      void this.notifyCriticalRiskEvents();
    }, 20000);

    // setInterval(() => this.notifyCertainNumbersPrecios(), 240000);

  }

  async onModuleDestroy() {
    this.logger.log('Deteniendo bot...');
    this.isPolling = false;
    if (this.alertIntervalRef) {
      clearInterval(this.alertIntervalRef);
      this.alertIntervalRef = undefined;
    }
    if (this.riskEventIntervalRef) {
      clearInterval(this.riskEventIntervalRef);
      this.riskEventIntervalRef = undefined;
    }
  }
  async notifyCertainNumbersPrecios() {
    for (const chatId of this.notifyChats) {
      await this.handleShowPrices(chatId);
      //await this.sendMessage(chatId, 'Mensaje personalizado cada minuto.');
    }
  }
  async pollMessages() {
    while (this.isPolling) {
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

    if (state.waitingForPanicStrategyId) {
      state.waitingForPanicStrategyId = false;
      this.chatStates.set(chatId, state);
      await this.executePanicStop(chatId, text.trim());
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
          '/dashboard [strategyId] - Resumen operativo\n' +
          '/performance [strategyId] - Rendimiento de estrategia\n' +
          '/performance_history [strategyId] [from] [to] - Histórico diario\n' +
          '/execution_log [strategyId] [symbol] - Eventos de ejecución\n' +
          '/risk_events - Últimos eventos críticos de riesgo\n' +
          '/panic_stop [strategyId] [symbolOpcional] [spot|margin] - Liquidación de emergencia\n' +
          '/crear_estrategia - Crear estrategia\n' +
          '/alertadelete [id] - Eliminar alerta\n' +
          '/stop_estrategia - Uso: /stop_estrategia [symbol] [id]\n' +

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
      case '/add_level':
        if (state.role !== 'admin') {
          await this.sendMessage(chatId, 'No tienes permiso para agregar niveles.');
          return;
        }
        await this.handleAddLevelStrategy(chatId, args);
        break;
      case '/stop_estrategia':
        if (state.role !== 'admin') {
          await this.sendMessage(chatId, 'No tienes permiso para detener estrategias.');
          return;
        }
        if (args.length !== 2) {
          await this.sendMessage(chatId, 'Uso: /stop_estrategia [symbol] [id]');
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
      case '/dashboard':
        await this.handleDashboard(chatId, args);
        break;
      case '/performance':
        await this.handlePerformance(chatId, args);
        break;
      case '/performance_history':
        await this.handlePerformanceHistory(chatId, args);
        break;
      case '/execution_log':
        await this.handleExecutionLog(chatId, args);
        break;
      case '/risk_events':
        await this.handleRiskEvents(chatId);
        break;
      case '/panic_stop':
        if (state.role !== 'admin') {
          await this.sendMessage(chatId, 'No tienes permiso para ejecutar panic stop.');
          return;
        }

        if (args.length === 0) {
          state.waitingForPanicStrategyId = true;
          this.chatStates.set(chatId, state);
          await this.sendMessage(chatId, 'Escribe el strategyId para ejecutar panic stop.');
          break;
        }

        await this.executePanicStop(chatId, args.join(' '));
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
    const state = this.chatStates.get(chatId);
    if (state?.role !== 'admin') {
      await this.sendMessage(chatId, 'No tienes permiso para crear estrategias.');
      return;
    }

    if (args.length < 4) {
      await this.sendMessage(chatId, 'Uso: /crear_estrategia [symbol] [typeId] [strategyType] [id] [configJsonOpcional]');
      return;
    }
    try {
      const [symbol, typeIdStr, strategyType, id, ...configParts] = args;
      const typeId = parseInt(typeIdStr);
      const configJson = configParts.join(' ');
      const config = configJson ? JSON.parse(configJson) : {};
      this.botService.startStrategy(symbol, typeId, strategyType, config, id);
      await this.sendMessage(chatId, `Estrategia creada y arrancada: ${id} para ${symbol}`);
    } catch (error) {
      await this.sendMessage(chatId, 'Error creando estrategia: ' + (error as Error).message);
    }
  }

  private async handleAddLevelStrategy(chatId: number, args: string[]) {
    const [symbol, id, priceRaw, amountRaw] = args;

    if (!symbol || !id || !priceRaw || !amountRaw) {
      return await this.sendMessage(chatId, ' Formato incompleto. Uso: `/add_level XRPFDUSD er10 1.85 3`');
    }

    const price = parseFloat(priceRaw);
    const quantity = parseFloat(amountRaw);

    if (isNaN(price) || isNaN(quantity)) {
      return await this.sendMessage(chatId, '❌ El precio y la cantidad deben ser números válidos.');
    }

    try {
      const success = await this.botService.addOrderLevel(id, symbol.toUpperCase(), {
        id: Date.now(),
        price,
        quantity
      });

      if (success) {
        await this.sendMessage(chatId, ` ¡Nivel agregado!\nSímbolo: ${symbol}\nPrecio: ${price}\nCant: ${quantity}`);
      } else {
        await this.sendMessage(chatId, ` No se encontró la estrategia con ID: ${id}`);
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
    const state = this.chatStates.get(chatId);
    if (state?.role !== 'admin') {
      await this.sendMessage(chatId, 'No tienes permiso para crear estrategias.');
      return;
    }

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
      [{ text: 'Precios', callback_data: 'show_prices' }, { text: 'Moneda', callback_data: 'ask_symbol' }],
      [{ text: 'Estrategias Activas', callback_data: 'list_strategies' }, { text: 'Dashboard', callback_data: 'show_dashboard' }],
      [{ text: 'Performance', callback_data: 'show_performance' }, { text: 'Execution Log', callback_data: 'show_execution_log' }],
      [{ text: 'Riesgo Crítico', callback_data: 'show_risk_events' }, { text: 'Panic Stop', callback_data: 'panic_stop' }],
      [{ text: 'Alertas', callback_data: 'create_alert' }, { text: 'Mis Cuentas', callback_data: 'list_accounts' }],
    ];
    if (role === 'admin') {
      buttons.push([{ text: 'Actualizar Saldo', callback_data: 'update_balance' }]);
    }
    buttons.push([{ text: 'Ayuda', callback_data: 'help' }, { text: 'Refrescar Menu', callback_data: 'refresh_menu' }]);

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
    let data = await this.binanceService.getCrossMarginPNLSummary();
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
        await this.handleShowStrategies(chatId,[]);
           break;
      case 'show_dashboard':
        await this.handleDashboard(chatId, []);
        break;
      case 'show_performance':
        await this.handlePerformance(chatId, []);
        break;
      case 'show_execution_log':
        await this.handleExecutionLog(chatId, []);
        break;
      case 'show_risk_events':
        await this.handleRiskEvents(chatId);
        break;
      case 'panic_stop': {
        const state = this.chatStates.get(chatId);
        if (state?.role !== 'admin') {
          await this.sendMessage(chatId, 'No tienes permisos para panic stop.');
          break;
        }

        state.waitingForPanicStrategyId = true;
        this.chatStates.set(chatId, state);
        await this.sendMessage(chatId, 'Escribe el strategyId para ejecutar panic stop.');
        break;
      }
      case 'delete_alert':
        await this.handleDeleteAlert(chatId, []);
     

        //await this.sendMessage(chatId, msg);
        //  await this.handleShowStrategies(chatId);
        break;
      case 'update_balance':
        await this.sendMessage(chatId, 'Comando admin: /actualizarsaldo [id] [moneda] [saldo]');
        break;

      case 'help':
        await this.sendMessage(chatId, 'Usa /menu para opciones disponibles');
        break;
      case 'refresh_menu': {
        const state = this.chatStates.get(chatId);
        await this.showMainMenu(chatId, state?.role);
        break;
      }
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
    const state = this.chatStates.get(chatId);
    if (state?.role !== 'admin') {
      await this.sendMessage(chatId, 'No tienes permiso para eliminar alertas.');
      return;
    }

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


        for (const chatId of this.adminUserIds) {
          await this.sendMessage(chatId,
            `Alerta: ${alert.symbol} está ${alert.up_down} de $${alert.price}. Precio actual: $${price.toFixed(4)}`
          );
        }
      }
    }
  }

  private async handleDashboard(chatId: number, args: string[]) {
    try {
      const strategyId = args[0];
      const dashboard = await this.botService.getDashboard(strategyId);
      const totals = dashboard?.totals;
      const topStrategies = (dashboard?.strategies ?? []).slice(0, 5)
        .map((item: any) => `${item.strategyId} | ${item.symbol ?? '-'} | pnl=${Number(item.realizedPnl ?? 0).toFixed(4)} | fills=${item.fills}`)
        .join('\n');

      const message = [
        '<b>Dashboard Operativo</b>',
        `Estrategias: ${totals?.strategies ?? 0}`,
        `Ordenes: ${totals?.orders ?? 0} | Fills: ${totals?.fills ?? 0}`,
        `Canceladas: ${totals?.cancelled ?? 0} | Rechazadas: ${totals?.rejected ?? 0}`,
        `PnL Realizado: ${Number(totals?.realizedPnl ?? 0).toFixed(4)}`,
        topStrategies ? `\nTop estrategias:\n${topStrategies}` : '',
      ].filter(Boolean).join('\n');

      await this.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (error) {
      await this.sendMessage(chatId, `Error cargando dashboard: ${(error as Error).message}`);
    }
  }

  private async handlePerformance(chatId: number, args: string[]) {
    try {
      const strategyId = args[0];
      const data = await this.botService.getPerformance(strategyId) as any;
      const list = Array.isArray(data) ? data : data ? [data] : [];

      if (!list.length) {
        await this.sendMessage(chatId, 'No hay datos de performance disponibles.');
        return;
      }

      const msg = list.slice(0, 8).map((item: any) =>
        `${item.strategyId} | ${item.symbol} | pnl=${Number(item.realizedPnl ?? 0).toFixed(4)} | winRate=${Number(item.winRate ?? 0).toFixed(2)}% | openLots=${item.openLots ?? 0}`,
      ).join('\n');

      await this.sendMessage(chatId, `<b>Performance</b>\n${msg}`, { parse_mode: 'HTML' });
    } catch (error) {
      await this.sendMessage(chatId, `Error obteniendo performance: ${(error as Error).message}`);
    }
  }

  private async handlePerformanceHistory(chatId: number, args: string[]) {
    try {
      const [strategyId, from, to] = args;
      const data = await this.botService.getPerformanceHistory(strategyId, from, to) as any;
      const timeline = (data?.timeline ?? []).slice(-7);

      if (!timeline.length) {
        await this.sendMessage(chatId, 'No hay histórico para el rango solicitado.');
        return;
      }

      const msg = timeline.map((item: any) =>
        `${item.day}: pnlDia=${Number(item.dailyPnl ?? 0).toFixed(4)} | pnlAcum=${Number(item.cumulativePnl ?? 0).toFixed(4)} | fills=${item.fills}`,
      ).join('\n');

      await this.sendMessage(chatId, `<b>Histórico de Performance</b>\n${msg}`, { parse_mode: 'HTML' });
    } catch (error) {
      await this.sendMessage(chatId, `Error en histórico: ${(error as Error).message}`);
    }
  }

  private async handleExecutionLog(chatId: number, args: string[]) {
    try {
      const strategyId = args[0];
      const symbol = args[1];
      const rows = this.botService.getExecutionLog(strategyId, symbol).slice(0, 10) as any[];

      if (!rows.length) {
        await this.sendMessage(chatId, 'No hay eventos de ejecución para ese filtro.');
        return;
      }

      const msg = rows.map((item: any) =>
        `${item.timestamp ?? '-'} | ${item.event ?? '-'} | ${item.strategyId ?? '-'} | ${item.symbol ?? '-'}`,
      ).join('\n');

      await this.sendMessage(chatId, `<b>Execution Log</b>\n${msg}`, { parse_mode: 'HTML' });
    } catch (error) {
      await this.sendMessage(chatId, `Error en execution log: ${(error as Error).message}`);
    }
  }

  private async handleRiskEvents(chatId: number) {
    const events = this.botService
      .getExecutionLog()
      .filter((item: any) => item.event === 'RISK_BLOCKED' || item.event === 'RISK_LIQUIDATION_TRIGGERED')
      .slice(0, 10) as any[];

    if (!events.length) {
      await this.sendMessage(chatId, 'Sin eventos críticos de riesgo recientes.');
      return;
    }

    const msg = events.map((item: any) =>
      `${item.timestamp ?? '-'} | ${item.event} | ${item.strategyId ?? '-'} | ${item.reason ?? '-'}`,
    ).join('\n');

    await this.sendMessage(chatId, `<b>Risk Events</b>\n${msg}`, { parse_mode: 'HTML' });
  }

  private async executePanicStop(chatId: number, payload: string) {
    const [strategyId, symbol, marketRaw] = payload.split(' ').filter(Boolean);
    if (!strategyId) {
      await this.sendMessage(chatId, 'Uso: /panic_stop [strategyId] [symbolOpcional] [spot|margin]');
      return;
    }

    const market = marketRaw === 'margin' ? 'margin' : marketRaw === 'spot' ? 'spot' : undefined;

    try {
      const result = await this.botService.panicStop(strategyId, {
        symbol,
        market,
      });

      await this.sendMessage(
        chatId,
        `Panic stop ejecutado\nEstrategia: ${result.strategyId}\nSymbol: ${result.symbol}\nMarket: ${result.market}`,
      );
    } catch (error) {
      await this.sendMessage(chatId, `Error ejecutando panic stop: ${(error as Error).message}`);
    }
  }

  private async notifyCriticalRiskEvents() {
    const events = this.strategyOpsService
      .getExecutionLog()
      .filter((item: any) => item.event === 'RISK_LIQUIDATION_TRIGGERED' || item.event === 'RISK_BLOCKED')
      .slice(0, 30) as any[];

    for (const event of events.reverse()) {
      const key = `${event.timestamp}|${event.event}|${event.strategyId}|${event.symbol}|${event.reason ?? ''}`;
      if (this.notifiedRiskEvents.has(key)) {
        continue;
      }

      this.notifiedRiskEvents.add(key);
      if (this.notifiedRiskEvents.size > 1000) {
        const first = this.notifiedRiskEvents.values().next().value;
        if (first) {
          this.notifiedRiskEvents.delete(first);
        }
      }

      const message = [
        '<b>Alerta de Riesgo</b>',
        `Evento: ${event.event}`,
        `Estrategia: ${event.strategyId ?? '-'}`,
        `Símbolo: ${event.symbol ?? '-'}`,
        `Razón: ${event.reason ?? '-'}`,
        `Hora: ${event.timestamp ?? '-'}`,
      ].join('\n');

      for (const chatId of this.notifyChats) {
        await this.sendMessage(chatId, message, { parse_mode: 'HTML' });
      }
    }
  }

  async sendMessage(chatId: number, text: string, options = {}): Promise<void> {
    if (!this.apiUrl) {
      this.logger.warn('No se envió mensaje: BOOT/TELEGRAM_BOT_TOKEN no configurado.');
      return;
    }

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
