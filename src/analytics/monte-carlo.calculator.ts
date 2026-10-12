// Monte Carlo de riesgo de ruina: resamplea con reemplazo el PnL neto de
// trades ya cerrados (BotRunnerTrade.pnl) para simular miles de futuros
// posibles de la curva de equity. Mismo criterio aditivo que
// analytics-calculator.ts (no geométrico): equity[i] = equity[i-1] + pnl
// resampleado, consistente con cómo ya se construye el equity curve real.
// Es una proyección basada en el propio historial de la cuenta, no en
// precio -- "predecir el futuro con contabilidad" en vez de con precio.

export interface MonteCarloInput {
  historicalPnl: ReadonlyArray<number>;
  startingEquity: number;
  horizonTrades: number;
  simulations: number;
  ruinThreshold?: number;
  maxDrawdownPctThreshold?: number;
  /** Inyectable para tests deterministas; default Math.random en producción. */
  rng?: () => number;
}

export interface MonteCarloOutput {
  simulations: number;
  horizonTrades: number;
  startingEquity: number;
  tradesSampled: number;
  finalEquity: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    mean: number;
  };
  maxDrawdownPct: { p50: number; p95: number };
  probabilityOfRuinPct: number;
  probabilityOfBreachingMaxDrawdownPct: number | null;
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

export function simulateEquityPaths(input: MonteCarloInput): MonteCarloOutput {
  const n = input.historicalPnl.length;
  if (n === 0) {
    throw new Error('simulateEquityPaths: no hay trades históricos para resamplear');
  }
  if (!Number.isInteger(input.simulations) || input.simulations < 1) {
    throw new Error('simulateEquityPaths: simulations debe ser un entero >= 1');
  }
  if (!Number.isInteger(input.horizonTrades) || input.horizonTrades < 1) {
    throw new Error('simulateEquityPaths: horizonTrades debe ser un entero >= 1');
  }
  const rng = input.rng ?? Math.random;
  const ruinThreshold = input.ruinThreshold ?? 0;

  const finals: number[] = new Array(input.simulations);
  const maxDrawdowns: number[] = new Array(input.simulations);
  let ruinCount = 0;
  let breachCount = 0;

  for (let s = 0; s < input.simulations; s++) {
    let equity = input.startingEquity;
    let peak = equity;
    let maxDd = 0;
    let ruined = false;
    let breached = false;
    for (let t = 0; t < input.horizonTrades; t++) {
      const idx = Math.min(n - 1, Math.floor(rng() * n));
      equity += input.historicalPnl[idx];
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
      if (!ruined && equity <= ruinThreshold) {
        ruined = true;
        ruinCount += 1;
      }
      if (
        !breached &&
        input.maxDrawdownPctThreshold !== undefined &&
        dd >= input.maxDrawdownPctThreshold
      ) {
        breached = true;
        breachCount += 1;
      }
    }
    finals[s] = equity;
    maxDrawdowns[s] = maxDd;
  }

  finals.sort((a, b) => a - b);
  maxDrawdowns.sort((a, b) => a - b);

  return {
    simulations: input.simulations,
    horizonTrades: input.horizonTrades,
    startingEquity: input.startingEquity,
    tradesSampled: n,
    finalEquity: {
      p5: Number(percentile(finals, 0.05).toFixed(8)),
      p25: Number(percentile(finals, 0.25).toFixed(8)),
      p50: Number(percentile(finals, 0.5).toFixed(8)),
      p75: Number(percentile(finals, 0.75).toFixed(8)),
      p95: Number(percentile(finals, 0.95).toFixed(8)),
      mean: Number(
        (finals.reduce((sum, v) => sum + v, 0) / finals.length).toFixed(8),
      ),
    },
    maxDrawdownPct: {
      p50: Number(percentile(maxDrawdowns, 0.5).toFixed(4)),
      p95: Number(percentile(maxDrawdowns, 0.95).toFixed(4)),
    },
    probabilityOfRuinPct: Number(((ruinCount / input.simulations) * 100).toFixed(2)),
    probabilityOfBreachingMaxDrawdownPct:
      input.maxDrawdownPctThreshold === undefined
        ? null
        : Number(((breachCount / input.simulations) * 100).toFixed(2)),
  };
}
