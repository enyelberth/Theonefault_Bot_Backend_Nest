import type { Candle } from '../../exchanges/domain';
import { atr } from '../../strategies/v2/indicators/atr';

export interface TrailingStopConfig {
  atrPeriod: number;
  atrMultiplier: number;
  activationPct?: number;
}

export interface TrailingStopState {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  peakPrice: number;
  troughPrice: number;
  currentStop: number | null;
  activated: boolean;
}

export function initTrailingStop(side: 'LONG' | 'SHORT', entryPrice: number): TrailingStopState {
  return {
    side,
    entryPrice,
    peakPrice: entryPrice,
    troughPrice: entryPrice,
    currentStop: null,
    activated: false,
  };
}

export function updateTrailingStop(
  state: TrailingStopState,
  candle: Candle,
  history: ReadonlyArray<Candle>,
  config: TrailingStopConfig,
): { state: TrailingStopState; triggered: boolean; stopPrice: number | null } {
  const price = candle.close;
  if (state.side === 'LONG') {
    state.peakPrice = Math.max(state.peakPrice, price);
  } else {
    state.troughPrice = Math.min(state.troughPrice, price);
  }

  if (!state.activated && config.activationPct) {
    const move =
      state.side === 'LONG'
        ? (state.peakPrice - state.entryPrice) / state.entryPrice
        : (state.entryPrice - state.troughPrice) / state.entryPrice;
    if (move >= config.activationPct) state.activated = true;
  } else if (!config.activationPct) {
    state.activated = true;
  }

  if (!state.activated) {
    return { state, triggered: false, stopPrice: state.currentStop };
  }

  const atrValue = atr(Array.from(history), config.atrPeriod);
  if (!atrValue || atrValue <= 0) {
    return { state, triggered: false, stopPrice: state.currentStop };
  }

  const distance = atrValue * config.atrMultiplier;
  const candidate =
    state.side === 'LONG' ? state.peakPrice - distance : state.troughPrice + distance;

  if (state.side === 'LONG') {
    state.currentStop =
      state.currentStop === null ? candidate : Math.max(state.currentStop, candidate);
    const triggered = price <= state.currentStop;
    return { state, triggered, stopPrice: state.currentStop };
  } else {
    state.currentStop =
      state.currentStop === null ? candidate : Math.min(state.currentStop, candidate);
    const triggered = price >= state.currentStop;
    return { state, triggered, stopPrice: state.currentStop };
  }
}
