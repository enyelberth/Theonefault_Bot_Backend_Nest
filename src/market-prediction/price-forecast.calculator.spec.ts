import {
  fitAr,
  forecastAr,
  fitGarch11,
  forecastGarchVariance,
  forecastPrice,
  computeConfidenceMultiplier,
  MIN_SAMPLES,
} from './price-forecast.calculator';

// PRNG determinístico (mulberry32) para que los tests sean reproducibles.
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

function gaussian(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

describe('fitAr', () => {
  it('recovers the true AR(1) coefficient from a synthetic series', () => {
    const rand = mulberry32(42);
    const phi = 0.4;
    const returns: number[] = [0];
    for (let i = 1; i < 2000; i++) {
      returns.push(phi * returns[i - 1] + 0.001 * gaussian(rand));
    }
    const fit = fitAr(returns, 1);
    expect(fit.coeffs[0]).toBeGreaterThan(0.3);
    expect(fit.coeffs[0]).toBeLessThan(0.5);
  });

  it('throws when there is not enough data for the requested order', () => {
    expect(() => fitAr([0.01, 0.02, 0.01], 5)).toThrow();
  });
});

describe('forecastAr', () => {
  it('reverts towards the intercept for a mean-reverting AR(1)', () => {
    const fit = { order: 1, intercept: 0, coeffs: [0.5], residualVariance: 0 };
    const forecasts = forecastAr(fit, [1], 10);
    // Cada paso multiplica por 0.5 -> converge a 0 geométricamente.
    expect(forecasts[0]).toBeCloseTo(0.5, 6);
    expect(forecasts[9]).toBeLessThan(0.01);
  });
});

describe('fitGarch11', () => {
  it('finds alpha+beta < 1 (stationary) and a positive omega on noisy returns', () => {
    const rand = mulberry32(7);
    const returns = Array.from({ length: 500 }, () => 0.002 * gaussian(rand));
    const fit = fitGarch11(returns);
    expect(fit.alpha + fit.beta).toBeLessThan(0.999);
    expect(fit.omega).toBeGreaterThan(0);
  });
});

describe('forecastGarchVariance', () => {
  it('reverts towards the unconditional variance over a long horizon', () => {
    const fit = {
      omega: 0.0001,
      alpha: 0.05,
      beta: 0.9,
      unconditionalVariance: 0.0001 / (1 - 0.05 - 0.9),
      finalVariance: 0.01, // shock bien por encima de lo incondicional
      logLikelihood: 0,
    };
    const forecasts = forecastGarchVariance(fit, 0, 200);
    expect(forecasts[0]).toBeCloseTo(
      fit.omega + fit.alpha * 0 + fit.beta * fit.finalVariance,
      10,
    );
    expect(forecasts[forecasts.length - 1]).toBeCloseTo(
      fit.unconditionalVariance,
      4,
    );
  });
});

describe('computeConfidenceMultiplier', () => {
  const config = { minSampleSize: 30, floorMultiplier: 0.25, ceilingMultiplier: 1.5 };

  it('returns neutral (1) when the sample size is below minSampleSize', () => {
    expect(computeConfidenceMultiplier(90, 10, config)).toBe(1);
  });

  it('returns neutral (1) when accuracy is exactly 50% (coin flip)', () => {
    expect(computeConfidenceMultiplier(50, 100, config)).toBe(1);
  });

  it('returns neutral (1) when accuracy is unavailable (null)', () => {
    expect(computeConfidenceMultiplier(null, 100, config)).toBe(1);
  });

  it('scales up towards ceilingMultiplier as accuracy approaches 100%', () => {
    expect(computeConfidenceMultiplier(100, 100, config)).toBeCloseTo(1.5, 6);
    expect(computeConfidenceMultiplier(75, 100, config)).toBeCloseTo(1.25, 6);
  });

  it('scales down towards floorMultiplier as accuracy approaches 0%', () => {
    expect(computeConfidenceMultiplier(0, 100, config)).toBeCloseTo(0.25, 6);
    expect(computeConfidenceMultiplier(25, 100, config)).toBeCloseTo(0.625, 6);
  });

  it('never exceeds the configured floor/ceiling even outside the 0..100 range', () => {
    expect(computeConfidenceMultiplier(500, 100, config)).toBe(1.5);
    expect(computeConfidenceMultiplier(-500, 100, config)).toBe(0.25);
  });
});

describe('forecastPrice', () => {
  it('returns INSUFFICIENT_DATA status below MIN_SAMPLES', () => {
    const closes = Array.from({ length: MIN_SAMPLES - 1 }, (_, i) => 100 + i);
    const result = forecastPrice({ closes, horizonBars: 1 });
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.modelParams).toBeNull();
  });

  it('forecasts close to the last price for a flat/no-drift series, with a widening interval', () => {
    const rand = mulberry32(99);
    const closes: number[] = [100];
    for (let i = 1; i < 300; i++) {
      closes.push(closes[i - 1] * Math.exp(0.0005 * gaussian(rand)));
    }
    const short = forecastPrice({ closes, horizonBars: 1 });
    const long = forecastPrice({ closes, horizonBars: 20 });
    expect(short.status).toBe('OK');
    const lastPrice = closes[closes.length - 1];
    expect(short.forecastPrice).toBeGreaterThan(lastPrice * 0.9);
    expect(short.forecastPrice).toBeLessThan(lastPrice * 1.1);
    expect(short.lowerBound).toBeLessThanOrEqual(short.forecastPrice);
    expect(short.upperBound).toBeGreaterThanOrEqual(short.forecastPrice);
    // El intervalo a 20 velas debe ser más ancho que el de 1 vela.
    const shortWidth = short.upperBound - short.lowerBound;
    const longWidth = long.upperBound - long.lowerBound;
    expect(longWidth).toBeGreaterThan(shortWidth);
  });
});
