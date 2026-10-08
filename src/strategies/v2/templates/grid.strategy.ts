import type { Candle, MarketType, Signal } from '../../../exchanges/domain';
import { holdSignal } from '../../../exchanges/domain';
import type { IStrategy, StrategyMetadata } from '../strategy.interface';
import type { StrategyContext } from '../strategy-context';

export interface GridStrategyConfig {
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  quotePerLevel: number;
  profitMargin: number;
  side?: 'BUY' | 'SELL' | 'BOTH';
  /** SPOT no permite abrir en SELL/BOTH (no se puede vender en corto sin margin). */
  market?: MarketType;
  /** Porcentaje de pérdida desde entryPrice (ej. 0.02 = 2%) para cerrar un nivel por stop-loss. Sin valor = sin stop-loss. */
  stopLossPct?: number;
  /**
   * MARKET ejecuta de inmediato (paga fee taker). LIMIT_MAKER deja la orden
   * resting en el nivel exacto (paga fee maker, más barato) — el runner la
   * sigue vigilando hasta que llene o se cumpla maxOrderAgeMs. El
   * stop-loss SIEMPRE sale por MARKET sin importar esto: una salida de
   * emergencia no se puede dejar resting esperando a que alguien la llene.
   */
  orderType?: 'MARKET' | 'LIMIT_MAKER';
  /** Edad máxima (ms) de una orden LIMIT_MAKER resting antes de cancelarla. Default 5min (lo aplica bot-runner, no esta clase). */
  maxOrderAgeMs?: number;
}

interface FilledLevel {
  entryPrice: number;
  quantity: number;
  side: 'BUY' | 'SELL';
}

interface GridState {
  levels: number[];
  // key = `${levelIndex}:${side}` — BOTH puede tener un fill BUY y uno SELL
  // en el mismo nivel de precio sin pisarse.
  filledLevels: Record<string, FilledLevel>;
  // Necesario para detectar CRUCE de nivel (no solo "está del lado
  // correcto"): sin esto, un nivel por encima del precio actual queda
  // "elegible" indefinidamente aunque el precio nunca haya llegado a él,
  // y vueltas repetidas a un precio plano terminan abriendo niveles que
  // el precio jamás tocó.
  lastPrice: number | null;
}

const META: StrategyMetadata = {
  id: 'grid',
  name: 'Grid Bot',
  version: '2.0.0',
  description:
    'Grid clásico (BUY, compra abajo / vende arriba) o grid corto en margin ' +
    '(SELL, vende arriba / recompra abajo). BOTH corre ambos a la vez.',
  tags: ['grid', 'template'],
  configSchema: {
    lowerPrice: { type: 'number', minimum: 0 },
    upperPrice: { type: 'number', minimum: 0 },
    gridCount: { type: 'integer', minimum: 2, maximum: 100, default: 10 },
    quotePerLevel: { type: 'number', minimum: 0, default: 20 },
    profitMargin: { type: 'number', minimum: 0, default: 0.005 },
    side: { type: 'string', enum: ['BUY', 'SELL', 'BOTH'], default: 'BUY' },
    market: {
      type: 'string',
      enum: ['SPOT', 'MARGIN_CROSS', 'MARGIN_ISOLATED'],
      default: 'SPOT',
    },
    stopLossPct: { type: 'number', minimum: 0 },
    orderType: {
      type: 'string',
      enum: ['MARKET', 'LIMIT_MAKER'],
      default: 'MARKET',
    },
    maxOrderAgeMs: { type: 'number', minimum: 0, default: 300_000 },
  },
};

export class GridStrategy implements IStrategy<GridStrategyConfig> {
  readonly metadata = META;

  init(ctx: StrategyContext<GridStrategyConfig>): void {
    const {
      lowerPrice,
      upperPrice,
      gridCount,
      side = 'BUY',
      market,
    } = ctx.config;
    if (lowerPrice <= 0 || upperPrice <= lowerPrice || gridCount < 2) {
      throw new Error('grid: invalid price range or gridCount < 2');
    }
    if ((side === 'SELL' || side === 'BOTH') && (market ?? 'SPOT') === 'SPOT') {
      // No ocultar esto detrás de un fallback silencioso: abrir SELL en
      // SPOT es una venta en corto que el exchange va a rechazar (o peor,
      // vender un balance que el usuario no quería liquidar). El caller
      // tiene que elegir margin a propósito.
      throw new Error(
        'grid: side SELL/BOTH requiere market MARGIN_CROSS o MARGIN_ISOLATED (SPOT no permite abrir en corto)',
      );
    }
    const step = (upperPrice - lowerPrice) / (gridCount - 1);
    const levels = Array.from({ length: gridCount }, (_, i) =>
      Number((lowerPrice + i * step).toFixed(8)),
    );
    ctx.setState<GridState>('grid', {
      levels,
      filledLevels: {},
      lastPrice: null,
    });
  }

  onCandle(candle: Candle, ctx: StrategyContext<GridStrategyConfig>): Signal {
    const state = ctx.state<GridState>('grid');
    if (!state) return holdSignal(ctx.symbol, 'no-state');

    const {
      profitMargin,
      quotePerLevel,
      side = 'BUY',
      stopLossPct,
      market = 'SPOT',
      orderType = 'MARKET',
    } = ctx.config;
    const price = candle.close;
    const previousPrice = state.lastPrice;
    state.lastPrice = price;

    // Primer candle: todavía no hay "anterior" con el que detectar un
    // cruce, así que no hay nada elegible para abrir todavía.
    if (previousPrice === null) {
      ctx.setState('grid', state);
      return holdSignal(ctx.symbol, 'seeding-last-price');
    }

    if (stopLossPct && stopLossPct > 0) {
      const stopSignal = this.checkStopLoss(
        state,
        price,
        stopLossPct,
        ctx,
        market,
      );
      if (stopSignal) return stopSignal;
    }

    if (side === 'BUY' || side === 'BOTH') {
      const openSignal = this.tryOpen(
        state,
        previousPrice,
        price,
        'BUY',
        quotePerLevel,
        ctx,
        market,
        orderType,
      );
      if (openSignal) return openSignal;
    }
    if (side === 'SELL' || side === 'BOTH') {
      const openSignal = this.tryOpen(
        state,
        previousPrice,
        price,
        'SELL',
        quotePerLevel,
        ctx,
        market,
        orderType,
      );
      if (openSignal) return openSignal;
    }

    const tpSignal = this.checkTakeProfit(
      state,
      price,
      profitMargin,
      ctx,
      market,
      orderType,
    );
    if (tpSignal) return tpSignal;

    return holdSignal(ctx.symbol, 'no-trigger');
  }

  /**
   * Abre solo si el precio CRUZÓ el nivel entre la vela anterior y esta
   * (no simplemente "está del lado correcto"): si no, un nivel por encima
   * del precio queda "elegible" para siempre y una racha de velas en
   * precio plano termina abriendo niveles que el precio nunca tocó.
   * Limitación conocida: un salto de precio que cruza varios niveles en
   * una sola vela solo abre el primero (orden ascendente) — razonable
   * para MARKET en vez de órdenes resting, no para gaps grandes.
   */
  private tryOpen(
    state: GridState,
    previousPrice: number,
    price: number,
    side: 'BUY' | 'SELL',
    quotePerLevel: number,
    ctx: StrategyContext<GridStrategyConfig>,
    market: MarketType,
    orderType: 'MARKET' | 'LIMIT_MAKER',
  ): Signal | null {
    const targetLevel =
      side === 'BUY'
        ? state.levels.find(
            (lvl, i) =>
              !state.filledLevels[`${i}:BUY`] &&
              previousPrice > lvl &&
              price <= lvl,
          )
        : state.levels.find(
            (lvl, i) =>
              !state.filledLevels[`${i}:SELL`] &&
              previousPrice < lvl &&
              price >= lvl,
          );
    if (targetLevel === undefined) return null;

    const idx = state.levels.indexOf(targetLevel);
    // LIMIT_MAKER va a llenar (si llena) al precio del nivel, no al close
    // actual: usar targetLevel como referencia es más fiel que price para
    // calcular qty y para el TP/SL que se evalúa en los próximos ticks.
    const refPrice = orderType === 'LIMIT_MAKER' ? targetLevel : price;
    const quantity = quotePerLevel / refPrice;
    state.filledLevels[`${idx}:${side}`] = {
      entryPrice: refPrice,
      quantity,
      side,
    };
    ctx.setState('grid', state);
    return {
      action: 'OPEN',
      symbol: ctx.symbol,
      side,
      type: orderType,
      ...(orderType === 'LIMIT_MAKER'
        ? { quantity, price: targetLevel }
        : { quoteQuantity: quotePerLevel }),
      market,
      reason: `grid ${side.toLowerCase()} level ${idx} @ ${targetLevel}`,
      metadata: { level: idx, side },
      emittedAt: ctx.now(),
    };
  }

  /** BUY cierra con ganancia subiendo (vende arriba); SELL cierra con ganancia bajando (recompra abajo). */
  private checkTakeProfit(
    state: GridState,
    price: number,
    profitMargin: number,
    ctx: StrategyContext<GridStrategyConfig>,
    market: MarketType,
    orderType: 'MARKET' | 'LIMIT_MAKER',
  ): Signal | null {
    for (const [key, filled] of Object.entries(state.filledLevels)) {
      const target =
        filled.side === 'BUY'
          ? filled.entryPrice * (1 + profitMargin)
          : filled.entryPrice * (1 - profitMargin);
      const hit = filled.side === 'BUY' ? price >= target : price <= target;
      if (hit) {
        delete state.filledLevels[key];
        ctx.setState('grid', state);
        const closeSide = filled.side === 'BUY' ? 'SELL' : 'BUY';
        return {
          action: 'CLOSE',
          symbol: ctx.symbol,
          side: closeSide,
          type: orderType,
          quantity: filled.quantity,
          ...(orderType === 'LIMIT_MAKER' ? { price: target } : {}),
          market,
          reason: `grid tp ${key} entry=${filled.entryPrice} target=${target.toFixed(4)}`,
          metadata: {
            key,
            side: filled.side,
            entryPrice: filled.entryPrice,
            quantity: filled.quantity,
          },
          emittedAt: ctx.now(),
        };
      }
    }
    return null;
  }

  /** BUY pierde si el precio cae; SELL (en corto) pierde si el precio sube. */
  private checkStopLoss(
    state: GridState,
    price: number,
    stopLossPct: number,
    ctx: StrategyContext<GridStrategyConfig>,
    market: MarketType,
  ): Signal | null {
    for (const [key, filled] of Object.entries(state.filledLevels)) {
      const stopPrice =
        filled.side === 'BUY'
          ? filled.entryPrice * (1 - stopLossPct)
          : filled.entryPrice * (1 + stopLossPct);
      const hit =
        filled.side === 'BUY' ? price <= stopPrice : price >= stopPrice;
      if (hit) {
        delete state.filledLevels[key];
        ctx.setState('grid', state);
        const closeSide = filled.side === 'BUY' ? 'SELL' : 'BUY';
        return {
          action: 'CLOSE',
          symbol: ctx.symbol,
          side: closeSide,
          type: 'MARKET',
          quantity: filled.quantity,
          market,
          reason: `grid stop-loss ${key} entry=${filled.entryPrice} stop=${stopPrice.toFixed(8)}`,
          metadata: {
            key,
            side: filled.side,
            stopLoss: true,
            entryPrice: filled.entryPrice,
            quantity: filled.quantity,
          },
          emittedAt: ctx.now(),
        };
      }
    }
    return null;
  }

  /**
   * Una orden que la estrategia ya había "comprometido" en su estado
   * interno (al emitir la señal) nunca llenó nada: hay que liberar ese
   * slot para que una señal futura lo vuelva a considerar, si no queda
   * huérfano para siempre.
   */
  onOrderFailed(
    ctx: StrategyContext<GridStrategyConfig>,
    signal: Signal,
  ): void {
    const state = ctx.state<GridState>('grid');
    if (!state) return;
    const meta = signal.metadata ?? {};

    if (signal.action === 'OPEN') {
      const level = meta.level as number | undefined;
      const side = meta.side as 'BUY' | 'SELL' | undefined;
      if (level === undefined || !side) return;
      delete state.filledLevels[`${level}:${side}`];
      ctx.setState('grid', state);
      return;
    }

    if (signal.action === 'CLOSE') {
      const key = meta.key as string | undefined;
      const side = meta.side as 'BUY' | 'SELL' | undefined;
      const entryPrice = meta.entryPrice as number | undefined;
      const quantity = meta.quantity as number | undefined;
      if (!key || !side || entryPrice === undefined || quantity === undefined) {
        return;
      }
      // El cierre nunca llenó: la posición sigue abierta de verdad, hay
      // que devolverla al estado para que el próximo candle la vuelva a
      // evaluar (si no, se "cierra" en nuestros registros sin haberse
      // cerrado en el exchange).
      state.filledLevels[key] = { entryPrice, quantity, side };
      ctx.setState('grid', state);
    }
  }
}
