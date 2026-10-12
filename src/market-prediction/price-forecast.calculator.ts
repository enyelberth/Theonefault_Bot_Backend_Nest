// Predicción estadística de precio: AR(p) sobre log-retornos para el nivel,
// GARCH(1,1) sobre los mismos retornos para la volatilidad del horizonte.
// Deliberadamente NO se usa ningún modelo de caja negra (LSTM/tensorflow):
// KAIZEN exige poder explicar cada decisión del sistema, y un AR+GARCH se
// puede auditar coeficiente por coeficiente. Esto da una ventaja
// probabilística, no una garantía -- el resultado siempre debe pasar por el
// motor de riesgo antes de afectar una orden real.

export const MIN_SAMPLES = 120;

export interface ArFit {
  order: number;
  intercept: number;
  coeffs: number[]; // coeffs[0] multiplica el retorno más reciente (lag 1), coeffs[1] el lag 2, etc.
  residualVariance: number;
}

export interface GarchFit {
  omega: number;
  alpha: number;
  beta: number;
  unconditionalVariance: number;
  finalVariance: number;
  logLikelihood: number;
}

export interface PriceForecastInput {
  closes: ReadonlyArray<number>; // cronológico, más viejo primero
  horizonBars: number;
  arOrder?: number;
}

export interface PriceForecastOutput {
  status: 'OK' | 'INSUFFICIENT_DATA';
  lastPrice: number;
  forecastPrice: number;
  lowerBound: number;
  upperBound: number;
  confidencePct: number;
  volatilityForecast: number;
  modelType: 'AR+GARCH';
  modelParams: {
    arOrder: number;
    arIntercept: number;
    arCoeffs: number[];
    garchOmega: number;
    garchAlpha: number;
    garchBeta: number;
  } | null;
  samplesUsed: number;
}

function mean(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: ReadonlyArray<number>): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return (
    values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
  );
}

function dot(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** Resuelve A·x = b por eliminación gaussiana con pivoteo parcial. */
function gaussianSolve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
    if (Math.abs(m[col][col]) < 1e-10) {
      throw new Error(
        'AR fit: matriz singular (retornos colineales o demasiado pocos datos)',
      );
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Mínimos cuadrados ordinarios de un AR(order) sobre la serie `returns`. */
export function fitAr(returns: ReadonlyArray<number>, order: number): ArFit {
  const n = returns.length;
  const rows = n - order;
  if (rows < order + 2) {
    throw new Error('fitAr: no hay suficientes datos para este order');
  }
  const design: number[][] = [];
  const target: number[] = [];
  for (let t = order; t < n; t++) {
    const row = [1];
    for (let lag = 0; lag < order; lag++) row.push(returns[t - 1 - lag]);
    design.push(row);
    target.push(returns[t]);
  }
  const p = order + 1;
  const xtx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const xty: number[] = new Array(p).fill(0);
  for (let r = 0; r < design.length; r++) {
    for (let i = 0; i < p; i++) {
      xty[i] += design[r][i] * target[r];
      for (let j = 0; j < p; j++) xtx[i][j] += design[r][i] * design[r][j];
    }
  }
  // Ridge chico y proporcional a la escala de cada diagonal: sin esto,
  // retornos casi colineales (tendencia geométrica muy suave, lags
  // redundantes) dejan X'X singular y gaussianSolve explota. El ridge
  // garantiza una solución de mínimos cuadrados finita sin mover
  // perceptiblemente el ajuste en el caso normal (bien condicionado).
  for (let i = 0; i < p; i++) {
    xtx[i][i] += 1e-10 * Math.max(1, Math.abs(xtx[i][i]));
  }
  const beta = gaussianSolve(xtx, xty);
  const residuals = design.map((row, idx) => target[idx] - dot(row, beta));
  return {
    order,
    intercept: beta[0],
    coeffs: beta.slice(1),
    residualVariance: variance(residuals),
  };
}

/** Proyecta `steps` retornos hacia adelante, realimentando cada forecast como lag. */
export function forecastAr(
  fit: ArFit,
  lastReturns: ReadonlyArray<number>,
  steps: number,
): number[] {
  if (lastReturns.length < fit.order) {
    throw new Error('forecastAr: lastReturns más corto que el order del AR');
  }
  const window = lastReturns.slice(-fit.order);
  const forecasts: number[] = [];
  for (let s = 0; s < steps; s++) {
    let value = fit.intercept;
    for (let lag = 0; lag < fit.order; lag++) {
      value += fit.coeffs[lag] * window[window.length - 1 - lag];
    }
    forecasts.push(value);
    window.push(value);
  }
  return forecasts;
}

function rangeStep(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) {
    out.push(Math.round(v * 1000) / 1000);
  }
  return out;
}

function garchLogLikelihood(
  returns: ReadonlyArray<number>,
  omega: number,
  alpha: number,
  beta: number,
  initVariance: number,
): { logLikelihood: number; finalVariance: number } {
  let v = initVariance;
  let ll = 0;
  for (const r of returns) {
    if (!Number.isFinite(v) || v <= 0) return { logLikelihood: -Infinity, finalVariance: v };
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(v) + (r * r) / v);
    v = omega + alpha * r * r + beta * v;
  }
  return { logLikelihood: ll, finalVariance: v };
}

/**
 * Ajusta GARCH(1,1) por grid search sobre (alpha, beta) maximizando la
 * quasi-log-likelihood gaussiana, con omega fijado por varianza
 * incondicional (omega = var*(1-alpha-beta)). Un grid search es más lento
 * que un optimizador tipo BFGS pero muchísimo más fácil de auditar y no
 * puede divergir -- aceptable porque esto corre una vez por vela cerrada,
 * no en el hot path de cada tick.
 */
export function fitGarch11(returns: ReadonlyArray<number>): GarchFit {
  const sampleVariance = variance(returns);
  let best: (GarchFit & { logLikelihood: number }) | null = null;
  for (const alpha of rangeStep(0.02, 0.3, 0.02)) {
    for (const beta of rangeStep(0.5, 0.97, 0.02)) {
      if (alpha + beta >= 0.999) continue;
      const omega = sampleVariance * (1 - alpha - beta);
      if (omega <= 0) continue;
      const { logLikelihood, finalVariance } = garchLogLikelihood(
        returns,
        omega,
        alpha,
        beta,
        sampleVariance,
      );
      if (!Number.isFinite(logLikelihood)) continue;
      if (!best || logLikelihood > best.logLikelihood) {
        best = {
          omega,
          alpha,
          beta,
          unconditionalVariance: sampleVariance,
          finalVariance,
          logLikelihood,
        };
      }
    }
  }
  if (!best) {
    // Ningún par (alpha,beta) del grid fue estable -- degrada a varianza
    // constante en vez de lanzar, para que el forecast de precio siga
    // funcionando con un intervalo de confianza más ancho/conservador.
    return {
      omega: sampleVariance,
      alpha: 0,
      beta: 0,
      unconditionalVariance: sampleVariance,
      finalVariance: sampleVariance,
      logLikelihood: NaN,
    };
  }
  return best;
}

/** Proyecta la varianza condicional `steps` pasos adelante (reversión a la incondicional). */
export function forecastGarchVariance(
  fit: GarchFit,
  lastReturn: number,
  steps: number,
): number[] {
  const forecasts: number[] = [];
  let v = fit.omega + fit.alpha * lastReturn * lastReturn + fit.beta * fit.finalVariance;
  forecasts.push(v);
  for (let s = 1; s < steps; s++) {
    v = fit.omega + (fit.alpha + fit.beta) * v;
    forecasts.push(v);
  }
  return forecasts;
}

export interface ConfidenceMultiplierConfig {
  minSampleSize: number;
  floorMultiplier: number;
  ceilingMultiplier: number;
}

/**
 * Traduce el accuracy direccional walk-forward (evaluateAccuracy) a un
 * multiplicador de tamaño de posición. 50% de accuracy (moneda al aire) =
 * multiplicador 1 (neutral, el sizer normal decide). Por encima escala
 * hacia ceilingMultiplier, por debajo hacia floorMultiplier -- siempre
 * clampeado, nunca por fuera del rango configurado. Con muestra chica
 * (< minSampleSize) devuelve 1: no hay suficiente evidencia walk-forward
 * todavía para confiar en el número y no hay que ni agrandar ni achicar
 * el tamaño a partir de ruido.
 */
export function computeConfidenceMultiplier(
  accuracyPct: number | null,
  sampleSize: number,
  config: ConfidenceMultiplierConfig,
): number {
  if (accuracyPct === null || sampleSize < config.minSampleSize) return 1;
  const clampedAccuracy = Math.max(0, Math.min(100, accuracyPct));
  let multiplier: number;
  if (clampedAccuracy >= 50) {
    multiplier =
      1 + ((clampedAccuracy - 50) / 50) * (config.ceilingMultiplier - 1);
  } else {
    multiplier = 1 - ((50 - clampedAccuracy) / 50) * (1 - config.floorMultiplier);
  }
  return Math.max(config.floorMultiplier, Math.min(config.ceilingMultiplier, multiplier));
}

const Z_95 = 1.959963984540054;

/**
 * Forecast de precio a `horizonBars` velas, con intervalo de confianza del
 * 95% derivado de la volatilidad GARCH (no de una varianza constante) --
 * así el intervalo se ensancha cuando el mercado está más volátil en vez de
 * subestimar el riesgo en momentos de stress.
 */
export function forecastPrice(input: PriceForecastInput): PriceForecastOutput {
  const order = input.arOrder ?? 2;
  const closes = input.closes;
  if (closes.length < MIN_SAMPLES) {
    return {
      status: 'INSUFFICIENT_DATA',
      lastPrice: closes.length > 0 ? closes[closes.length - 1] : 0,
      forecastPrice: 0,
      lowerBound: 0,
      upperBound: 0,
      confidencePct: 95,
      volatilityForecast: 0,
      modelType: 'AR+GARCH',
      modelParams: null,
      samplesUsed: closes.length,
    };
  }
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    logReturns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const arFit = fitAr(logReturns, order);
  const returnForecasts = forecastAr(arFit, logReturns.slice(-order), input.horizonBars);
  const cumulativeReturn = returnForecasts.reduce((sum, r) => sum + r, 0);
  const lastPrice = closes[closes.length - 1];
  const forecastPriceValue = lastPrice * Math.exp(cumulativeReturn);

  const garchFit = fitGarch11(logReturns);
  const lastReturn = logReturns[logReturns.length - 1];
  const varianceForecasts = forecastGarchVariance(
    garchFit,
    lastReturn,
    input.horizonBars,
  );
  const cumulativeVariance = varianceForecasts.reduce((sum, v) => sum + v, 0);
  const horizonStdev = Math.sqrt(Math.max(0, cumulativeVariance));

  const lowerReturn = cumulativeReturn - Z_95 * horizonStdev;
  const upperReturn = cumulativeReturn + Z_95 * horizonStdev;

  return {
    status: 'OK',
    lastPrice,
    forecastPrice: forecastPriceValue,
    lowerBound: lastPrice * Math.exp(lowerReturn),
    upperBound: lastPrice * Math.exp(upperReturn),
    confidencePct: 95,
    volatilityForecast: horizonStdev,
    modelType: 'AR+GARCH',
    modelParams: {
      arOrder: order,
      arIntercept: arFit.intercept,
      arCoeffs: arFit.coeffs,
      garchOmega: garchFit.omega,
      garchAlpha: garchFit.alpha,
      garchBeta: garchFit.beta,
    },
    samplesUsed: closes.length,
  };
}
