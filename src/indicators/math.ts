/**
 * Puras funciones de indicadores. Sin dependencias.
 */

export type TrendDirection = 'UP' | 'DOWN' | 'SIDEWAYS';

export interface BollingerResult {
  middle: number;
  upper: number;
  lower: number;
  bandwidth: number; // (upper-lower)/middle
  percentB: number;  // (price-lower)/(upper-lower)
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

export interface TrendResult {
  direction: TrendDirection;
  strength: number; // 0..1
  emaFast: number;
  emaSlow: number;
  slope: number; // pendiente regresión lineal
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = sma(values.slice(0, period), period)!;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

export function stdDev(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

export function bollinger(
  closes: number[],
  period = 20,
  k = 2,
): BollingerResult | null {
  const middle = sma(closes, period);
  const sd = stdDev(closes, period);
  if (middle === null || sd === null) return null;
  const upper = middle + k * sd;
  const lower = middle - k * sd;
  const last = closes[closes.length - 1];
  return {
    middle,
    upper,
    lower,
    bandwidth: middle === 0 ? 0 : (upper - lower) / middle,
    percentB: upper === lower ? 0.5 : (last - lower) / (upper - lower),
  };
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdResult | null {
  if (closes.length < slow + signalPeriod) return null;
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  if (emaFast === null || emaSlow === null) return null;

  // Serie MACD histórica para signal EMA
  const macdSeries: number[] = [];
  for (let i = slow - 1; i < closes.length; i++) {
    const win = closes.slice(0, i + 1);
    const f = ema(win, fast);
    const s = ema(win, slow);
    if (f !== null && s !== null) macdSeries.push(f - s);
  }
  const signal = ema(macdSeries, signalPeriod);
  if (signal === null) return null;
  const macdVal = macdSeries[macdSeries.length - 1];
  return { macd: macdVal, signal, histogram: macdVal - signal };
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  if (highs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  // Wilder smoothing
  let a = trs.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < trs.length; i++) {
    a = (a * (period - 1) + trs[i]) / period;
  }
  return a;
}

export function vwap(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
): number | null {
  if (!highs.length) return null;
  let pv = 0;
  let vSum = 0;
  for (let i = 0; i < highs.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    pv += tp * volumes[i];
    vSum += volumes[i];
  }
  if (vSum === 0) return null;
  return pv / vSum;
}

export function linearRegSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function trend(
  closes: number[],
  fastPeriod = 20,
  slowPeriod = 50,
  slopeWindow = 20,
): TrendResult | null {
  const emaFast = ema(closes, fastPeriod);
  const emaSlow = ema(closes, slowPeriod);
  if (emaFast === null || emaSlow === null) return null;
  const slope = linearRegSlope(closes.slice(-slopeWindow));
  const diff = emaFast - emaSlow;
  const norm = emaSlow === 0 ? 0 : Math.abs(diff) / emaSlow;
  const strength = Math.min(1, norm * 100);

  let direction: TrendDirection;
  const threshold = emaSlow * 0.001; // 0.1%
  if (diff > threshold && slope > 0) direction = 'UP';
  else if (diff < -threshold && slope < 0) direction = 'DOWN';
  else direction = 'SIDEWAYS';

  return { direction, strength, emaFast, emaSlow, slope };
}
