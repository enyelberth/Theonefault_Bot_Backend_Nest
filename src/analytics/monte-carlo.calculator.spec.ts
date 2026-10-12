import { simulateEquityPaths } from './monte-carlo.calculator';

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('simulateEquityPaths', () => {
  it('throws on empty historical PnL', () => {
    expect(() =>
      simulateEquityPaths({
        historicalPnl: [],
        startingEquity: 1000,
        horizonTrades: 10,
        simulations: 10,
      }),
    ).toThrow();
  });

  it('reports ~0% probability of ruin when every historical trade is a gain', () => {
    const result = simulateEquityPaths({
      historicalPnl: [10, 20, 15, 5, 30],
      startingEquity: 1000,
      horizonTrades: 50,
      simulations: 500,
      rng: mulberry32(1),
    });
    expect(result.probabilityOfRuinPct).toBe(0);
    expect(result.finalEquity.p5).toBeGreaterThan(1000);
  });

  it('reports high probability of ruin when every historical trade is a loss', () => {
    const result = simulateEquityPaths({
      historicalPnl: [-10, -20, -15, -5, -30],
      startingEquity: 100,
      horizonTrades: 50,
      simulations: 500,
      rng: mulberry32(2),
    });
    expect(result.probabilityOfRuinPct).toBeGreaterThan(90);
  });

  it('keeps percentiles ordered (p5 <= p25 <= p50 <= p75 <= p95)', () => {
    const rand = mulberry32(3);
    // Mezcla de ganancias y pérdidas -- dispersión real entre simulaciones.
    const historicalPnl = Array.from({ length: 30 }, () =>
      Math.round((rand() - 0.45) * 100),
    );
    const result = simulateEquityPaths({
      historicalPnl,
      startingEquity: 5000,
      horizonTrades: 100,
      simulations: 1000,
      rng: mulberry32(4),
    });
    const { p5, p25, p50, p75, p95 } = result.finalEquity;
    expect(p5).toBeLessThanOrEqual(p25);
    expect(p25).toBeLessThanOrEqual(p50);
    expect(p50).toBeLessThanOrEqual(p75);
    expect(p75).toBeLessThanOrEqual(p95);
  });

  it('computes probabilityOfBreachingMaxDrawdownPct only when a threshold is given', () => {
    const withThreshold = simulateEquityPaths({
      historicalPnl: [-50, 10, -30, 20, -40],
      startingEquity: 1000,
      horizonTrades: 50,
      simulations: 300,
      maxDrawdownPctThreshold: 5,
      rng: mulberry32(5),
    });
    expect(withThreshold.probabilityOfBreachingMaxDrawdownPct).not.toBeNull();
    expect(withThreshold.probabilityOfBreachingMaxDrawdownPct).toBeGreaterThan(0);

    const withoutThreshold = simulateEquityPaths({
      historicalPnl: [-50, 10, -30, 20, -40],
      startingEquity: 1000,
      horizonTrades: 50,
      simulations: 300,
      rng: mulberry32(5),
    });
    expect(withoutThreshold.probabilityOfBreachingMaxDrawdownPct).toBeNull();
  });
});
