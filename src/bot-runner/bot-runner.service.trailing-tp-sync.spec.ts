import { BotRunnerService } from './bot-runner.service';
import { initTrailingStop } from '../risk/stops/trailing-stop';
import { initTpLadder } from '../risk/stops/tp-ladder';
import { OrderSide } from '@prisma/client';

function buildService() {
  const createTrace = jest.fn().mockResolvedValue({});
  const createExecutionMetric = jest.fn().mockResolvedValue({});
  const recordPartialClose = jest.fn().mockResolvedValue({
    trade: {},
    pnl: 5,
    fee: 0.1,
  });
  const repo = { createTrace, createExecutionMetric, recordPartialClose } as any;
  const risk = { isKilled: jest.fn().mockResolvedValue(false) } as any;
  const ledger = { recordMany: jest.fn().mockResolvedValue(0) } as any;
  const dummy = {} as any;
  const service = new BotRunnerService(
    dummy, // registry
    dummy, // selector
    risk,
    repo,
    dummy, // copyBus
    dummy, // regimes
    dummy, // klines
    dummy, // alerts
    ledger,
    dummy, // forecasts
    dummy, // confluence
  );
  return { service, repo, risk, ledger, createTrace, createExecutionMetric, recordPartialClose };
}

describe('BotRunnerService.checkTpLadders -- keeps trailingStates.quantity in sync', () => {
  it('reduces the trailing-stop quantity by the exact amount a partial tp-ladder fill sold, so a later trailing-stop close never oversells', async () => {
    const { service, repo } = buildService();

    const tradeId = 42;
    const symbol = 'BTCUSDT';
    const entryPrice = 100;
    const originalQuantity = 10;

    const exchange = {
      id: 'test-exchange',
      getTicker: jest.fn().mockResolvedValue({ price: 101, bid: 100.9, ask: 101.1 }),
      placeOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'FILLED',
        averagePrice: 101,
        price: 101,
        filledQuantity: 2.5, // 25% level
        quantity: 2.5,
        fee: 0.1,
        feeCurrency: 'USDT',
      }),
    };

    const tpLadderConfig = {
      levels: [
        { targetPct: 0.01, sizePct: 0.25 },
        { targetPct: 0.02, sizePct: 0.75 },
      ],
    };

    const handle = {
      dbRun: { id: 1 },
      input: { runId: 'r1', symbol, exchange: { mode: 'paper' } },
      exchange,
      status: { ordersPlaced: 0 },
      tpLadderConfig,
      tpLadderStates: new Map([
        [
          tradeId,
          {
            state: initTpLadder('LONG', entryPrice, originalQuantity),
            symbol,
            side: OrderSide.BUY,
          },
        ],
      ]),
      trailingStates: new Map([
        [
          tradeId,
          {
            state: initTrailingStop('LONG', entryPrice),
            quantity: originalQuantity, // arranca igual al tamaño completo, como en vivo
            symbol,
            side: OrderSide.BUY,
          },
        ],
      ]),
    } as any;

    // Vela que dispara el nivel 1 (+1% = 101).
    const candle = {
      symbol,
      timeframe: '15m',
      openTime: 0,
      closeTime: 1,
      open: 100,
      high: 101.5,
      low: 100,
      close: 101,
      volume: 1,
      closed: true,
    };

    await (service as any).checkTpLadders(handle, candle);

    expect(repo.recordPartialClose).toHaveBeenCalledWith(
      expect.objectContaining({ tradeId, quantity: 2.5 }),
    );
    // El fill parcial fue 2.5 de 10 -- el trailing-stop no debe seguir
    // pensando que la posición completa (10) sigue ahí.
    expect(handle.trailingStates.get(tradeId)?.quantity).toBeCloseTo(7.5, 6);
    // El trade sigue abierto (no fue el nivel final) -- sigue supervisado.
    expect(handle.tpLadderStates.has(tradeId)).toBe(true);
    expect(handle.trailingStates.has(tradeId)).toBe(true);
  });

  it('never lets trailingStates.quantity go negative even if fills overlap unexpectedly', async () => {
    const { service } = buildService();
    const tradeId = 7;
    const symbol = 'BTCUSDT';

    const exchange = {
      id: 'test-exchange',
      getTicker: jest.fn().mockResolvedValue({ price: 101 }),
      placeOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'FILLED',
        averagePrice: 101,
        filledQuantity: 999, // más de lo que trailingStates cree tener
        fee: 0,
      }),
    };
    const tpLadderConfig = { levels: [{ targetPct: 0.01, sizePct: 0.5 }, { targetPct: 0.02, sizePct: 0.5 }] };

    const handle = {
      dbRun: { id: 1 },
      input: { runId: 'r1', symbol, exchange: { mode: 'paper' } },
      exchange,
      status: { ordersPlaced: 0 },
      tpLadderConfig,
      tpLadderStates: new Map([
        [tradeId, { state: initTpLadder('LONG', 100, 10), symbol, side: OrderSide.BUY }],
      ]),
      trailingStates: new Map([
        [tradeId, { state: initTrailingStop('LONG', 100), quantity: 1, symbol, side: OrderSide.BUY }],
      ]),
    } as any;

    const candle = {
      symbol,
      timeframe: '15m',
      openTime: 0,
      closeTime: 1,
      open: 100,
      high: 101.5,
      low: 100,
      close: 101,
      volume: 1,
      closed: true,
    };

    await (service as any).checkTpLadders(handle, candle);

    expect(handle.trailingStates.get(tradeId)?.quantity).toBeGreaterThanOrEqual(0);
  });
});
