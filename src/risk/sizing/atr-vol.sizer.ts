import { atr } from '../../strategies/v2/indicators/atr';
import type { IPositionSizer, SizingInput, SizingResult } from './position-sizer.interface';

export interface AtrVolConfig {
  riskPct: number;
  atrPeriod: number;
  atrMultiplier: number;
}

export class AtrVolSizer implements IPositionSizer {
  readonly id = 'atr-vol';

  constructor(private readonly config: AtrVolConfig) {
    if (config.riskPct <= 0 || config.riskPct > 1) {
      throw new Error('atr-vol: riskPct must be in (0, 1]');
    }
    if (config.atrPeriod < 2 || config.atrMultiplier <= 0) {
      throw new Error('atr-vol: invalid atrPeriod or atrMultiplier');
    }
  }

  compute(input: SizingInput): SizingResult {
    const { equity, price, history } = input;
    if (!history || history.length < this.config.atrPeriod + 1) {
      return {
        quoteQuantity: 0,
        quantity: 0,
        sizer: this.id,
        notes: 'insufficient history',
      };
    }
    const atrValue = atr(Array.from(history), this.config.atrPeriod);
    if (!atrValue || atrValue <= 0) {
      return { quoteQuantity: 0, quantity: 0, sizer: this.id, notes: 'atr=0' };
    }
    const perUnitRisk = atrValue * this.config.atrMultiplier;
    const capitalAtRisk = equity * this.config.riskPct;
    const quantity = capitalAtRisk / perUnitRisk;
    return {
      quoteQuantity: quantity * price,
      quantity,
      sizer: this.id,
      notes: `atr=${atrValue.toFixed(6)} stopDist=${perUnitRisk.toFixed(6)}`,
    };
  }
}
