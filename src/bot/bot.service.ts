import { forwardRef, Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { TradingStrategy } from 'src/strategies/trading-strategy.interface';
import { StrategyFactory } from './strategy.factory';
import { BinanceService } from 'src/binance/binance.service';
import { PaperExchangeService } from 'src/binance/paper-exchange.service';
import { StrategiesTradingService } from 'src/strategies-trading/strategies-trading.service';
import { CreateTradingStrategyDto } from 'src/strategies-trading/dto/create-strategies-trading.dto';
import { BotPnlService } from './bot-pnl.service';
import { BotRunStatus, PrismaClient } from '@prisma/client';
import { IndicatorsService } from 'src/indicators/indicators.service';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private activeStrategies = new Map<string, TradingStrategy>();
  private botRunIds = new Map<string, number>();

  constructor(
    private readonly binanceService: BinanceService,
    private readonly paperExchangeService: PaperExchangeService,
    private readonly strategiesTradingService: StrategiesTradingService,
    private readonly botPnlService: BotPnlService,
    private readonly indicatorsService: IndicatorsService,
    private readonly prisma: PrismaClient,
  ) {}

  async onModuleInit() {
    try {
      await this.rehydrateRunningBots();
    } catch (e) {
      this.logger.error(`Rehydrate on boot failed: ${(e as Error).message}`);
    }
  }

  /**
   * Al iniciar el backend, busca BotRun con status=RUNNING y relanza estrategias
   * usando configSnapshot y el botRunId existente (sin crear nuevo BotRun).
   */
  private async rehydrateRunningBots() {
    const runs = await this.prisma.botRun.findMany({
      where: { status: BotRunStatus.RUNNING },
      orderBy: { startedAt: 'asc' },
    });
    if (!runs.length) return;
    this.logger.warn(`Rehidratando ${runs.length} BotRun(s) activos desde DB`);

    for (const run of runs) {
      const cfg = (run.configSnapshot ?? {}) as any;
      const strategyType = run.strategyType;
      if (!strategyType) {
        this.logger.warn(`BotRun ${run.id} sin strategyType — se salta`);
        continue;
      }
      const key = this.getKey(run.symbol, run.strategyId);
      if (this.activeStrategies.has(key)) continue;

      const dryRun = !!cfg?.dryRun;
      let exchange: BinanceService = this.binanceService;
      if (dryRun) {
        const paper = new PaperExchangeService(this.prisma);
        paper.setBotRunId(run.id);
        exchange = paper;
      }

      let strategy: TradingStrategy;
      try {
        strategy = StrategyFactory.createStrategy(
          strategyType,
          exchange,
          run.strategyId,
          run.symbol,
          cfg,
          { indicators: this.indicatorsService },
        );
      } catch (err) {
        this.logger.error(`Rehidratar BotRun ${run.id} falló al crear estrategia: ${(err as Error).message}`);
        await this.botPnlService.stopBotRun(run.id, BotRunStatus.ERROR, (err as Error).message);
        continue;
      }

      if (strategy.attachPnlReporter) {
        const { StrategyPnlReporter } = await import('./strategy-pnl-reporter');
        const reporter = new StrategyPnlReporter(this.botPnlService, run.id, run.symbol);
        strategy.attachPnlReporter(reporter);
      }

      if (strategy.setBotRunContext) {
        strategy.setBotRunContext(run.id, this.prisma);
      }

      this.activeStrategies.set(key, strategy);
      this.botRunIds.set(key, run.id);
      this.logger.log(`Rehidratado BotRun ${run.id} (${run.symbol}/${run.strategyId}) — running...`);

      strategy.run().catch(async (err) => {
        this.logger.error(`Rehidratada estrategia ${run.id} falló: ${(err as Error).message}`);
        await this.botPnlService.stopBotRun(run.id, BotRunStatus.ERROR, (err as Error).message);
        this.activeStrategies.delete(key);
        this.botRunIds.delete(key);
      });
    }
  }

  private async isEmergencyActive(): Promise<boolean> {
    try {
      const cfg = await this.prisma.riskConfig.findUnique({ where: { id: 1 } });
      if (!cfg?.emergencyStopUntil) return false;
      return cfg.emergencyStopUntil.getTime() > Date.now();
    } catch {
      return false;
    }
  }

  private getKey(symbol: string, id: string): string {
    return `${symbol}-${id}`;
  }

  getBotRunId(symbol: string, id: string): number | undefined {
    return this.botRunIds.get(this.getKey(symbol, id));
  }

  async startStrategy(symbol: string, typeId: number, strategyType: string, config: any, id: string) {
    if (await this.isEmergencyActive()) {
      throw new Error('Emergency stop activo. No se aceptan nuevos bots.');
    }

    const key = this.getKey(symbol, id);

    if (this.activeStrategies.has(key)) {
      throw new Error(`Estrategia ya activa con este símbolo ${symbol} y el id ${id}`);
    }

    const createTradingStrategyDto: CreateTradingStrategyDto = {
      symbol,
      typeId,
      config,
      strategyType,
      id,
    };

    try {
      await this.strategiesTradingService.createStrategies(createTradingStrategyDto);
    } catch (err) {
      this.logger.warn(`TradingStrategy persist skipped (${id}): ${err?.message ?? err}`);
    }

    const botRun = await this.botPnlService.startBotRun({
      strategyId: id,
      symbol,
      strategyType,
      initialQuote: config?.initialQuote,
      configSnapshot: config,
    });
    this.botRunIds.set(key, botRun.id);

    const dryRun = !!config?.dryRun;
    let exchange: BinanceService = this.binanceService;
    if (dryRun) {
      // Instancia dedicada por bot para aislar botRunId (evita contaminación entre bots concurrentes).
      const paper = new PaperExchangeService(this.prisma);
      paper.setBotRunId(botRun.id);
      exchange = paper;
      this.logger.warn(`[DRY-RUN] Bot ${id} on ${symbol} usa PaperExchange dedicado (botRunId=${botRun.id}).`);
    }

    const strategy: TradingStrategy = StrategyFactory.createStrategy(
      strategyType,
      exchange,
      id,
      symbol,
      config,
      { indicators: this.indicatorsService },
    );

    if (strategy.attachPnlReporter) {
      const { StrategyPnlReporter } = await import('./strategy-pnl-reporter');
      const reporter = new StrategyPnlReporter(this.botPnlService, botRun.id, symbol);
      strategy.attachPnlReporter(reporter);
    }

    if (strategy.setBotRunContext) {
      strategy.setBotRunContext(botRun.id, this.prisma);
    }

    this.activeStrategies.set(key, strategy);

    try {
      await strategy.run();
    } catch (error) {
      this.logger.error(`Strategy ${id} on ${symbol} failed`, error as Error);
      await this.botPnlService.stopBotRun(
        botRun.id,
        BotRunStatus.ERROR,
        (error as Error)?.message,
      );
      this.activeStrategies.delete(key);
      this.botRunIds.delete(key);
      throw error;
    }
  }

  async stopStrategy(symbol: string, id: string) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (strategy && strategy.stop) {
      await strategy.stop();
    }
    this.activeStrategies.delete(key);

    const botRunId = this.botRunIds.get(key);
    if (botRunId !== undefined) {
      await this.botPnlService.stopBotRun(botRunId, BotRunStatus.STOPPED);
      this.botRunIds.delete(key);
    }
  }

  async restartStrategy(symbol: string, id: string) {
    const key = this.getKey(symbol, id);
    const strategyInMem = this.activeStrategies.get(key);
    const runIdInMem = this.botRunIds.get(key);

    let config: any = strategyInMem?.config ?? null;

    const existingRun =
      (runIdInMem
        ? await this.prisma.botRun.findUnique({ where: { id: runIdInMem } })
        : null) ?? (await this.botPnlService.findActiveBotRun(id, symbol));

    if (!existingRun) {
      throw new Error(
        `No existe BotRun previo para ${symbol}/${id} — usar /bot/start.`,
      );
    }

    config = config ?? (existingRun.configSnapshot as any);
    const strategyType = existingRun.strategyType;

    if (!config || !strategyType) {
      throw new Error(
        `No se pudo recuperar config/strategyType para restart ${symbol}/${id}`,
      );
    }

    this.logger.warn(
      `Restart bot ${symbol}/${id} (type=${strategyType}, botRunId=${existingRun.id})`,
    );

    if (this.activeStrategies.has(key)) {
      const strat = this.activeStrategies.get(key);
      if (strat && strat.stop) {
        try {
          await strat.stop();
        } catch (e) {
          this.logger.warn(`stop() falló en restart: ${(e as Error).message}`);
        }
      }
      this.activeStrategies.delete(key);
    }

    await new Promise((r) => setTimeout(r, 250));

    if (await this.isEmergencyActive()) {
      throw new Error('Emergency stop activo. No se puede reiniciar.');
    }

    if (existingRun.status !== BotRunStatus.RUNNING) {
      await this.prisma.botRun.update({
        where: { id: existingRun.id },
        data: { status: BotRunStatus.RUNNING, stoppedAt: null, errorMessage: null },
      });
    }

    this.botRunIds.set(key, existingRun.id);

    const dryRun = !!config?.dryRun;
    let exchange: BinanceService = this.binanceService;
    if (dryRun) {
      const paper = new PaperExchangeService(this.prisma);
      paper.setBotRunId(existingRun.id);
      exchange = paper;
    }

    const strategy: TradingStrategy = StrategyFactory.createStrategy(
      strategyType,
      exchange,
      id,
      symbol,
      config,
      { indicators: this.indicatorsService },
    );

    if (strategy.attachPnlReporter) {
      const { StrategyPnlReporter } = await import('./strategy-pnl-reporter');
      const reporter = new StrategyPnlReporter(
        this.botPnlService,
        existingRun.id,
        symbol,
      );
      strategy.attachPnlReporter(reporter);
    }

    if (strategy.setBotRunContext) {
      strategy.setBotRunContext(existingRun.id, this.prisma);
    }

    this.activeStrategies.set(key, strategy);

    strategy.run().catch(async (err) => {
      this.logger.error(
        `Estrategia ${id} on ${symbol} falló tras restart: ${(err as Error).message}`,
      );
      await this.botPnlService.stopBotRun(
        existingRun.id,
        BotRunStatus.ERROR,
        (err as Error).message,
      );
      this.activeStrategies.delete(key);
      this.botRunIds.delete(key);
    });

    return { botRunId: existingRun.id, symbol, id, strategyType, hydrated: true };
  }

  getActiveBots(): string[] {
    return Array.from(this.activeStrategies.keys());
  }

  async getActiveBotsData() {
    const strategies = Array.from(this.activeStrategies.values());

    const newStrategiesData = strategies.map((strategy) => ({
      id: strategy.id,
      symbol: strategy.symbol,
      config: strategy.config,
      strategyType: strategy.constructor,
    }));

    console.log(newStrategiesData);
    return newStrategiesData;
  }

  getBots() {
    return Array.from(this.activeStrategies.entries()).map(([key, strategy]) => {
      const [symbol, id] = key.split('-');
      return {
        symbol,
        id,
        strategy,
      };
    });
  }

  

  async updateOrderLevelPrice(id: string, symbol: string, levelIndex: number, newPrice: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new Error(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['updateOrderLevelPrice'] === 'function') {
      await strategy['updateOrderLevelPrice'](levelIndex, newPrice);
      return true;
    }
    throw new Error(`La estrategia con id ${id} no soporta actualizar precio de nivel`);
  }

  async removeOrderLevel(id: string, symbol: string, levelIndex: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new Error(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['removeOrderLevel'] === 'function') {
      await strategy['removeOrderLevel'](levelIndex);
      return true;
    }
    throw new Error(`La estrategia con id ${id} no soporta eliminar niveles de orden`);
  }

  addOrderLevel(id: string, symbol: string, orderLevel: any) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new Error(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['addOrderLevel'] === 'function') {
      strategy['addOrderLevel'](orderLevel);
      return true;
    }
    throw new Error(`La estrategia con id ${id} no soporta agregar niveles de orden`);
  }

  updateProfitMargin(id: string, symbol: string, newProfitMargin: number) {
    const key = this.getKey(symbol, id);
    const strategy = this.activeStrategies.get(key);
    if (!strategy) {
      throw new Error(`Estrategia con id ${id} no encontrada`);
    }
    if (typeof strategy['updateProfitMargin'] === 'function') {
      strategy['updateProfitMargin'](newProfitMargin);
      return true;
    }
    throw new Error(`La estrategia con id ${id} no soporta actualización de profit margin`);
  }
}
