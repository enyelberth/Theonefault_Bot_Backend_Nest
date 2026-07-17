import type { IPositionSizer, SizingInput, SizingResult } from './position-sizer.interface';

export interface FixedPctConfig {
  riskPct: number;
  fallbackPct?: number;
}

export class FixedPctSizer implements IPositionSizer {
  readonly id = 'fixed-pct';

  constructor(private readonly config: FixedPctConfig) {
    if (config.riskPct <= 0 || config.riskPct > 1) {
      throw new Error('fixed-pct: riskPct must be in (0, 1]');
    }
  }

  compute(input: SizingInput): SizingResult {
    const { equity, price, stopPrice } = input;
    if (equity <= 0 || price <= 0) {
      return { quoteQuantity: 0, quantity: 0, sizer: this.id, notes: 'invalid inputs' };
    }
    if (stopPrice && stopPrice > 0 && stopPrice !== price) {
      const perUnitRisk = Math.abs(price - stopPrice);
      const capitalAtRisk = equity * this.config.riskPct;
      const quantity = capitalAtRisk / perUnitRisk;
      return {
        quoteQuantity: quantity * price,
        quantity,
        sizer: this.id,
      };
    }
    const fallback = this.config.fallbackPct ?? this.config.riskPct;
    const quoteQuantity = equity * fallback;
    return {
      quoteQuantity,
      quantity: quoteQuantity / price,
      sizer: this.id,
      notes: 'no stop, using fallbackPct',
    };
  }
}
