// Aplica en backtest los mismos filtros opcionales que BotRunnerService
// aplica en vivo (regimeFilter, multiTimeframe, priceForecast,
// confluenceFilter), reusando las mismas funciones puras -- sin esto, un
// backtest nunca refleja el efecto de estos filtros y
// AnalyticsService.compareModes() termina comparando un backtest "pelado"
// contra un paper/real que sí los aplica. Todo opcional y aditivo: un
// backtest sin ninguna de estas claves en `config` se comporta exactamente
// igual que antes.
import type { Candle, Timeframe } from '../../exchanges/domain';
import {
  detectMarketRegime,
  regimeAllowsFilter,
} from '../../market-regime/market-regime.detector';
import type { RegimeFilterConfig } from '../../market-regime/market-regime.types';
import {
  evaluateTimeframeAlignment,
  type MultiTimeframeConfig,
  type TimeframeContext,
} from '../../market-regime/multi-timeframe';
import { rsi, bollinger, macd, atr, vwap, trend as trendIndicator, ema } from '../../indicators/math';
import type { IndicatorSnapshot } from '../../indicators/indicators.service';
import {
  forecastPrice,
  type PriceForecastOutput,
} from '../../market-prediction/price-forecast.calculator';
import { computeConfluence } from '../../confluence/confluence.calculator';
import type { ConfluenceWeights } from '../../confluence/confluence.types';
import { DEFAULT_EXTRA_TIMEFRAMES } from '../../confluence/confluence.service';

export interface PriceForecastFilterConfig {
  enabled?: boolean;
  horizonBars?: number;
  arOrder?: number;
  maxDivergencePct?: number;
  allowInsufficientData?: boolean;
}

export interface ConfluenceFilterConfig {
  enabled?: boolean;
  minScore?: number;
  minConfidence?: number;
  allowNeutral?: boolean;
  usePriceForecast?: boolean;
  priceForecastHorizonBars?: number;
  extraTimeframes?: Array<{ timeframe: string; weight?: number }>;
  weights?: ConfluenceWeights;
}

export interface EntryFilterConfig {
  regimeFilter?: RegimeFilterConfig;
  multiTimeframe?: MultiTimeframeConfig;
  priceForecast?: PriceForecastFilterConfig;
  confluenceFilter?: ConfluenceFilterConfig;
}

export interface EntryFilterResult {
  allowed: boolean;
  reason?: string;
}

/** Mismo cálculo que IndicatorsService.getSnapshot(), sobre un array de velas en memoria en vez de ir a DB. */
export function buildIndicatorSnapshot(
  symbol: string,
  timeframe: string,
  candles: ReadonlyArray<Candle>,
): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const last = candles[candles.length - 1];
  return {
    symbol,
    interval: timeframe,
    lastClose: closes[closes.length - 1] ?? 0,
    rsi: rsi(closes, 14),
    bollinger: bollinger(closes, 20, 2),
    macd: macd(closes, 12, 26, 9),
    atr: atr(highs, lows, closes, 14),
    vwap: vwap(highs, lows, closes, volumes),
    trend: trendIndicator(closes, 20, 50),
    emaFast: ema(closes, 20),
    emaSlow: ema(closes, 50),
    timestamp: new Date(last?.closeTime ?? Date.now()),
  };
}

export interface ApplyEntryFiltersInput {
  symbol: string;
  timeframe: Timeframe;
  side: 'BUY' | 'SELL';
  /** Precio de referencia para el forecast (normalmente el close/fill price de la señal). */
  referencePrice: number;
  /** Velas del timeframe primario hasta la barra actual (sin look-ahead), más vieja primero. */
  primaryHistory: ReadonlyArray<Candle>;
  /** Velas de timeframes extra (para multiTimeframe/confluenceFilter) hasta la barra actual, por timeframe. */
  extraTimeframeHistory?: Record<string, ReadonlyArray<Candle>>;
  config: EntryFilterConfig;
}

/**
 * Evalúa, en orden, regimeFilter -> multiTimeframe -> priceForecast ->
 * confluenceFilter -- primer rechazo corta. Cada uno es independiente y
 * opcional, igual que en BotRunnerService; solo se activa si la clave
 * correspondiente está presente y `enabled: true` en config.
 */
/** forecastPrice() nunca debería tirar con el ridge de fitAr ya aplicado,
 * pero un backtest puede recorrer miles de barras con datos históricos
 * reales e impredecibles -- un fallo puntual de cómputo no debe abortar
 * toda la corrida, mismo criterio fail-open que BotRunnerService.checkPriceForecast. */
function safeForecastPrice(
  closes: ReadonlyArray<number>,
  horizonBars: number,
  arOrder?: number,
): PriceForecastOutput | null {
  try {
    return forecastPrice({ closes, horizonBars, arOrder });
  } catch {
    return null;
  }
}

export function applyEntryFilters(input: ApplyEntryFiltersInput): EntryFilterResult {
  const { config } = input;
  let regimeResult = null as ReturnType<typeof detectMarketRegime> | null;

  if (config.regimeFilter?.enabled) {
    regimeResult = detectMarketRegime(input.symbol, input.timeframe, input.primaryHistory);
    if (!regimeAllowsFilter(regimeResult, config.regimeFilter)) {
      return {
        allowed: false,
        reason: `REGIME_FILTER: ${regimeResult.regime} confidence=${regimeResult.confidence}`,
      };
    }
  }

  if (config.multiTimeframe?.enabled) {
    if (!regimeResult) {
      regimeResult = detectMarketRegime(input.symbol, input.timeframe, input.primaryHistory);
    }
    const contexts: TimeframeContext[] = [
      { timeframe: input.timeframe, weight: 1, regime: regimeResult },
    ];
    for (const extra of config.multiTimeframe.contexts.slice(0, 4)) {
      const hist = input.extraTimeframeHistory?.[extra.timeframe];
      if (!hist || hist.length === 0) continue;
      contexts.push({
        timeframe: extra.timeframe,
        weight: extra.weight ?? 1,
        regime: detectMarketRegime(input.symbol, extra.timeframe, hist),
      });
    }
    const mtf = evaluateTimeframeAlignment(
      input.side,
      contexts,
      config.multiTimeframe.minScore ?? 60,
      config.multiTimeframe.minConfidence ?? 0,
      config.multiTimeframe.allowUnknown ?? false,
    );
    if (!mtf.aligned) {
      return { allowed: false, reason: 'MULTI_TIMEFRAME_FILTER: contexts not aligned' };
    }
  }

  let forecastResult: PriceForecastOutput | null = null;
  if (config.priceForecast?.enabled) {
    forecastResult = safeForecastPrice(
      input.primaryHistory.map((c) => c.close),
      config.priceForecast.horizonBars ?? 5,
      config.priceForecast.arOrder,
    );
    if (!forecastResult || forecastResult.status !== 'OK') {
      if (config.priceForecast.allowInsufficientData === false) {
        return { allowed: false, reason: 'PRICE_FORECAST_FILTER: insufficient data' };
      }
    } else {
      const maxDivergencePct = config.priceForecast.maxDivergencePct ?? 1;
      const expectedChangePct =
        input.referencePrice > 0
          ? ((forecastResult.forecastPrice - input.referencePrice) / input.referencePrice) * 100
          : 0;
      const ok =
        input.side === 'BUY'
          ? expectedChangePct >= -maxDivergencePct
          : expectedChangePct <= maxDivergencePct;
      if (!ok) {
        return { allowed: false, reason: 'PRICE_FORECAST_FILTER: divergencia estadística contra la señal' };
      }
    }
  }

  if (config.confluenceFilter?.enabled) {
    if (!regimeResult) {
      regimeResult = detectMarketRegime(input.symbol, input.timeframe, input.primaryHistory);
    }
    const extraTfSpecs = config.confluenceFilter.extraTimeframes ?? DEFAULT_EXTRA_TIMEFRAMES;
    const contexts: TimeframeContext[] = [
      { timeframe: input.timeframe, weight: 1, regime: regimeResult },
    ];
    for (const extra of extraTfSpecs.slice(0, 4)) {
      const hist = input.extraTimeframeHistory?.[extra.timeframe];
      if (!hist || hist.length === 0) continue;
      contexts.push({
        timeframe: extra.timeframe,
        weight: extra.weight ?? 1,
        regime: detectMarketRegime(input.symbol, extra.timeframe, hist),
      });
    }
    // 'BUY' da directamente el score de sesgo alcista 0-100 que necesita
    // computeConfluence -- mismo criterio que ConfluenceService.compute().
    const mtfForConfluence = evaluateTimeframeAlignment('BUY', contexts, 50, 0, true);
    const indicators = buildIndicatorSnapshot(input.symbol, input.timeframe, input.primaryHistory);
    let forecastForConfluence: PriceForecastOutput | undefined;
    if (config.confluenceFilter.usePriceForecast) {
      forecastForConfluence =
        forecastResult ??
        safeForecastPrice(
          input.primaryHistory.map((c) => c.close),
          config.confluenceFilter.priceForecastHorizonBars ?? 5,
        ) ??
        undefined;
    }
    const confluence = computeConfluence(
      regimeResult,
      mtfForConfluence,
      indicators,
      { weights: config.confluenceFilter.weights },
      forecastForConfluence,
    );
    const minScore = config.confluenceFilter.minScore ?? 55;
    const minConfidence = config.confluenceFilter.minConfidence ?? 0;
    const biasOk = confluence.bias !== 'NEUTRAL' || config.confluenceFilter.allowNeutral === true;
    const confidenceOk = confluence.confidence >= minConfidence;
    const scoreOk =
      input.side === 'BUY' ? confluence.score >= minScore : confluence.score <= 100 - minScore;
    if (!(biasOk && confidenceOk && scoreOk)) {
      return { allowed: false, reason: 'CONFLUENCE_FILTER: score insuficiente o en contra de la señal' };
    }
  }

  return { allowed: true };
}
