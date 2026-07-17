export interface TpLevel {
  targetPct: number;
  sizePct: number;
}

export interface TpLadderConfig {
  levels: TpLevel[];
}

export interface TpLadderState {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  totalQuantity: number;
  filledLevels: number[];
}

export interface TpFillDecision {
  levelIndex: number;
  quantity: number;
  targetPrice: number;
}

export const DEFAULT_TP_LADDER: TpLadderConfig = {
  levels: [
    { targetPct: 0.01, sizePct: 0.25 },
    { targetPct: 0.02, sizePct: 0.5 },
    { targetPct: 0.05, sizePct: 0.25 },
  ],
};

export function validateTpLadder(config: TpLadderConfig): void {
  if (!config.levels?.length) throw new Error('tp-ladder: empty levels');
  const totalSize = config.levels.reduce((a, l) => a + l.sizePct, 0);
  if (Math.abs(totalSize - 1) > 0.001) {
    throw new Error(`tp-ladder: sizePct must sum to 1 (got ${totalSize.toFixed(3)})`);
  }
  for (const l of config.levels) {
    if (l.sizePct <= 0 || l.sizePct > 1) throw new Error('tp-ladder: invalid sizePct');
    if (l.targetPct <= 0) throw new Error('tp-ladder: invalid targetPct');
  }
}

export function initTpLadder(
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  totalQuantity: number,
): TpLadderState {
  return { side, entryPrice, totalQuantity, filledLevels: [] };
}

export function evaluateTpLadder(
  state: TpLadderState,
  currentPrice: number,
  config: TpLadderConfig,
): TpFillDecision | null {
  for (let i = 0; i < config.levels.length; i++) {
    if (state.filledLevels.includes(i)) continue;
    const level = config.levels[i];
    const target =
      state.side === 'LONG'
        ? state.entryPrice * (1 + level.targetPct)
        : state.entryPrice * (1 - level.targetPct);
    const hit = state.side === 'LONG' ? currentPrice >= target : currentPrice <= target;
    if (!hit) continue;
    state.filledLevels.push(i);
    return {
      levelIndex: i,
      quantity: state.totalQuantity * level.sizePct,
      targetPrice: target,
    };
  }
  return null;
}

export function isTpLadderComplete(state: TpLadderState, config: TpLadderConfig): boolean {
  return state.filledLevels.length >= config.levels.length;
}
