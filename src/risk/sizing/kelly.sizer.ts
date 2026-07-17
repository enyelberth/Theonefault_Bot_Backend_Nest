import type { IPositionSizer, SizingInput, SizingResult } from './position-sizer.interface';

export interface KellyConfig {
  winRate: number;
  winLossRatio: number;
  fraction?: number;
  cap?: number;
}

export class KellySizer implements IPositionSizer {
  readonly id = 'kelly';

  constructor(private readonly config: KellyConfig) {
    if (config.winRate <= 0 || config.winRate >= 1) {
      throw new Error('kelly: winRate must be in (0, 1)');
    }
    if (config.winLossRatio <= 0) {
      throw new Error('kelly: winLossRatio must be > 0');
    }
  }

  compute(input: SizingInput): SizingResult {
    const { equity, price } = input;
    const { winRate, winLossRatio, fraction = 0.5, cap = 0.25 } = this.config;
    if (equity <= 0 || price <= 0) {
      return { quoteQuantity: 0, quantity: 0, sizer: this.id, notes: 'invalid inputs' };
    }
    const kelly = winRate - (1 - winRate) / winLossRatio;
    const applied = Math.max(0, Math.min(kelly * fraction, cap));
    const quoteQuantity = equity * applied;
    return {
      quoteQuantity,
      quantity: quoteQuantity / price,
      sizer: this.id,
      notes: `kelly=${kelly.toFixed(3)} applied=${applied.toFixed(3)}`,
    };
  }
}
