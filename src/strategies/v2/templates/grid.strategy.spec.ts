import type { Candle } from '../../../exchanges/domain';
import { InMemoryStrategyContext } from '../in-memory-context';
import { GridStrategy, GridStrategyConfig } from './grid.strategy';

const candle = (close: number, closeTime = Date.now()): Candle => ({
  symbol: 'BTCUSDT',
  timeframe: '1m',
  openTime: closeTime - 60_000,
  closeTime,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
  closed: true,
});

function buildCtx(config: GridStrategyConfig) {
  return new InMemoryStrategyContext<GridStrategyConfig>({
    strategyId: 'test',
    symbol: 'BTCUSDT',
    timeframe: '1m',
    config,
    exchange: {} as any,
  });
}

describe('GridStrategy', () => {
  it('la primera vela solo siembra lastPrice: nunca abre sin un cruce real', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BUY',
    });
    strategy.init(ctx);

    // Arranca ya por debajo de un nivel (95 < 100): si abriera acá sería
    // sin haber visto cruzar nada, solo por "estar del lado correcto".
    expect(strategy.onCandle(candle(95), ctx).action).toBe('HOLD');
  });

  it('BUY: abre solo cuando el precio CRUZA un nivel bajando, no por estar ya debajo', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3, // niveles 90, 100, 110
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BUY',
    });
    strategy.init(ctx);

    strategy.onCandle(candle(105), ctx); // siembra lastPrice=105 (sobre el nivel 100)
    // se queda plano en 105: no cruzó nada, no debe abrir
    expect(strategy.onCandle(candle(105), ctx).action).toBe('HOLD');

    const open = strategy.onCandle(candle(95), ctx); // 105 -> 95 cruza el nivel 100
    expect(open.action).toBe('OPEN');
    expect(open.side).toBe('BUY');
    expect(open.market).toBe('SPOT');

    // vuelve a quedarse plano: no vuelve a abrir el mismo nivel
    expect(strategy.onCandle(candle(95), ctx).action).toBe('HOLD');

    const close = strategy.onCandle(candle(100), ctx); // 95 -> 100: TP (>=1% sobre 95)
    expect(close.action).toBe('CLOSE');
    expect(close.side).toBe('SELL');
  });

  it('BUY: stop-loss cierra en pérdida si el precio cae lo suficiente', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.5, // TP lejísimo, para que dispare el SL primero
      side: 'BUY',
      stopLossPct: 0.05,
    });
    strategy.init(ctx);
    strategy.onCandle(candle(105), ctx); // siembra
    strategy.onCandle(candle(95), ctx); // cruza el nivel 100, abre en 95

    const stop = strategy.onCandle(candle(85), ctx); // 95*(1-0.05)=90.25 >= 85
    expect(stop.action).toBe('CLOSE');
    expect(stop.side).toBe('SELL');
    expect(stop.metadata?.stopLoss).toBe(true);
  });

  it('SELL: abre solo cuando el precio CRUZA un nivel subiendo (vende caro, en corto)', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'SELL',
      market: 'MARGIN_CROSS',
    });
    strategy.init(ctx);

    strategy.onCandle(candle(95), ctx); // siembra, por debajo del nivel 100
    const open = strategy.onCandle(candle(105), ctx); // cruza el nivel 100 subiendo
    expect(open.action).toBe('OPEN');
    expect(open.side).toBe('SELL');
    expect(open.market).toBe('MARGIN_CROSS');

    const close = strategy.onCandle(candle(95), ctx); // bajó >=1%, ganancia en corto
    expect(close.action).toBe('CLOSE');
    expect(close.side).toBe('BUY');
  });

  it('SELL: stop-loss cierra en pérdida si el precio sube contra el corto', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.5,
      side: 'SELL',
      market: 'MARGIN_CROSS',
      stopLossPct: 0.05,
    });
    strategy.init(ctx);
    strategy.onCandle(candle(95), ctx); // siembra
    strategy.onCandle(candle(105), ctx); // cruza subiendo, abre corto en 105

    const stop = strategy.onCandle(candle(115), ctx); // 105*1.05=110.25 <= 115
    expect(stop.action).toBe('CLOSE');
    expect(stop.side).toBe('BUY');
    expect(stop.metadata?.stopLoss).toBe(true);
  });

  it('BOTH: puede tener un fill BUY y uno SELL en niveles distintos sin pisarse', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 130,
      gridCount: 5, // niveles 90, 100, 110, 120, 130
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BOTH',
      market: 'MARGIN_CROSS',
    });
    strategy.init(ctx);

    strategy.onCandle(candle(115), ctx); // siembra, entre 110 y 120
    const openBuy = strategy.onCandle(candle(105), ctx); // cruza 110 bajando
    expect(openBuy.action).toBe('OPEN');
    expect(openBuy.side).toBe('BUY');

    const openSell = strategy.onCandle(candle(125), ctx); // cruza 120 subiendo
    expect(openSell.action).toBe('OPEN');
    expect(openSell.side).toBe('SELL');
  });

  it('rechaza SELL/BOTH en SPOT: no se puede abrir en corto sin margin', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'SELL',
      market: 'SPOT',
    });
    expect(() => strategy.init(ctx)).toThrow(/MARGIN_CROSS|MARGIN_ISOLATED/);
  });

  it('orderType LIMIT_MAKER: abre con price/quantity en el nivel exacto en vez de MARKET+quoteQuantity', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BUY',
      orderType: 'LIMIT_MAKER',
    });
    strategy.init(ctx);
    strategy.onCandle(candle(105), ctx); // siembra

    const open = strategy.onCandle(candle(95), ctx); // cruza el nivel 100
    expect(open.action).toBe('OPEN');
    expect(open.type).toBe('LIMIT_MAKER');
    expect(open.price).toBe(100); // el nivel, no el close (95)
    expect(open.quantity).toBeCloseTo(1); // 100 quote / 100 price
    expect(open.quoteQuantity).toBeUndefined();
  });

  it('orderType LIMIT_MAKER: el TP también sale resting al precio target, pero el stop-loss siempre sale por MARKET', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BUY',
      orderType: 'LIMIT_MAKER',
      stopLossPct: 0.5, // bien lejos, para que primero dispare el TP
    });
    strategy.init(ctx);
    strategy.onCandle(candle(105), ctx);
    strategy.onCandle(candle(95), ctx); // abre en nivel 100 (LIMIT_MAKER)

    const tp = strategy.onCandle(candle(102), ctx); // 100*1.01=101 <= 102
    expect(tp.action).toBe('CLOSE');
    expect(tp.type).toBe('LIMIT_MAKER');
    expect(tp.price).toBeCloseTo(101);
  });

  it('onOrderFailed libera el nivel de un OPEN rechazado para que una señal futura lo vuelva a considerar', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BUY',
    });
    strategy.init(ctx);
    strategy.onCandle(candle(105), ctx);
    const open = strategy.onCandle(candle(95), ctx); // cruza y "reserva" el nivel 100
    expect(open.action).toBe('OPEN');

    // la orden nunca se ejecutó (rechazada por el exchange)
    strategy.onOrderFailed(ctx, open);

    // sin el fix, esto daría HOLD porque el nivel seguiría marcado como ocupado
    strategy.onCandle(candle(105), ctx); // vuelve a subir, sin cruce todavía
    const retry = strategy.onCandle(candle(95), ctx); // vuelve a cruzar 100 bajando
    expect(retry.action).toBe('OPEN');
    expect(retry.metadata?.level).toBe(open.metadata?.level);
  });

  it('onOrderFailed restaura la posición si el CLOSE (TP/SL) nunca se ejecutó', () => {
    const strategy = new GridStrategy();
    const ctx = buildCtx({
      lowerPrice: 90,
      upperPrice: 110,
      gridCount: 3,
      quotePerLevel: 100,
      profitMargin: 0.01,
      side: 'BUY',
    });
    strategy.init(ctx);
    strategy.onCandle(candle(105), ctx);
    strategy.onCandle(candle(95), ctx); // abre en 95

    const tp = strategy.onCandle(candle(100), ctx); // dispara TP
    expect(tp.action).toBe('CLOSE');

    // el cierre nunca se ejecutó (orden rechazada/cancelada sin fill)
    strategy.onOrderFailed(ctx, tp);

    // la posición sigue abierta de verdad: un nuevo toque del TP debe
    // volver a dispararlo, no comportarse como si ya no existiera
    const tpAgain = strategy.onCandle(candle(101), ctx);
    expect(tpAgain.action).toBe('CLOSE');
    expect(tpAgain.side).toBe('SELL');
  });
});
