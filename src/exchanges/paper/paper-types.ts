export interface PaperAssetBalance {
  free: number;
  locked: number;
  avgEntry?: number;
}

export type PaperBalances = Record<string, PaperAssetBalance>;

export function ensureBalance(balances: PaperBalances, asset: string): PaperAssetBalance {
  if (!balances[asset]) balances[asset] = { free: 0, locked: 0 };
  return balances[asset];
}

export function totalOf(b: PaperAssetBalance): number {
  return b.free + b.locked;
}
