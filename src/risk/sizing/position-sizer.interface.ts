import type { Candle } from '../../exchanges/domain';

export interface SizingInput {
  equity: number;
  price: number;
  stopPrice?: number;
  history?: ReadonlyArray<Candle>;
  requestedQuote?: number;
  requestedQuantity?: number;
}

export interface SizingResult {
  quoteQuantity: number;
  quantity: number;
  sizer: string;
  notes?: string;
}

export interface IPositionSizer {
  readonly id: string;
  compute(input: SizingInput): SizingResult;
}
