export * from './position-sizer.interface';
export * from './fixed-pct.sizer';
export * from './kelly.sizer';
export * from './atr-vol.sizer';

import { AtrVolConfig, AtrVolSizer } from './atr-vol.sizer';
import { FixedPctConfig, FixedPctSizer } from './fixed-pct.sizer';
import { KellyConfig, KellySizer } from './kelly.sizer';
import type { IPositionSizer } from './position-sizer.interface';

export type SizerSpec =
  | { type: 'fixed-pct'; config: FixedPctConfig }
  | { type: 'kelly'; config: KellyConfig }
  | { type: 'atr-vol'; config: AtrVolConfig };

export function buildSizer(spec: SizerSpec): IPositionSizer {
  switch (spec.type) {
    case 'fixed-pct':
      return new FixedPctSizer(spec.config);
    case 'kelly':
      return new KellySizer(spec.config);
    case 'atr-vol':
      return new AtrVolSizer(spec.config);
  }
}
