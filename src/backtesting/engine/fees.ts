export interface FeesConfig {
  makerBps: number;
  takerBps: number;
  slippageBps: number;
  spreadBps?: number;
}

export const DEFAULT_FEES: FeesConfig = {
  makerBps: 10,
  takerBps: 10,
  slippageBps: 5,
  spreadBps: 2,
};

export function applyFee(notional: number, bps: number): number {
  return notional * (bps / 10_000);
}

export function applySlippage(price: number, side: 'BUY' | 'SELL', bps: number): number {
  const factor = bps / 10_000;
  return side === 'BUY' ? price * (1 + factor) : price * (1 - factor);
}

export function fillPriceForMarket(
  reference: number,
  side: 'BUY' | 'SELL',
  fees: FeesConfig,
): number {
  const spread = (fees.spreadBps ?? 0) / 10_000;
  const spreadAdjusted = side === 'BUY' ? reference * (1 + spread / 2) : reference * (1 - spread / 2);
  return applySlippage(spreadAdjusted, side, fees.slippageBps);
}
