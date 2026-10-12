# KAIZEN — Guía para agentes de desarrollo

Este archivo es la fuente de contexto para Claude Code, Codex y cualquier agente que trabaje en este repositorio. Léelo antes de modificar el proyecto.

## Objetivo del producto

KAIZEN es una plataforma de trading algorítmico con ejecución real y paper, backtesting, estrategias configurables, control de riesgo, copy trading, datos de mercado y analítica. La prioridad absoluta es preservar capital y poder explicar cada decisión del sistema.

## Stack y comandos

- NestJS 11, TypeScript, Prisma y PostgreSQL.
- Node.js 22.
- Instalar dependencias: `npm ci`.
- Generar Prisma: `npx prisma generate`.
- Compilar: `npm run build`.
- Pruebas unitarias: `npm test`.
- Pruebas e2e: `npm run test:e2e`.
- Lint: `npm run lint` (advertencia: actualmente aplica cambios con `--fix`).

No mezclar npm y Yarn. `package-lock.json` es el lockfile objetivo mientras no se acuerde lo contrario.

## Arquitectura relevante

- `src/strategies/v2`: contratos, registro y estrategias nuevas.
- `src/bot-runner`: ciclo estrategia -> riesgo -> exchange -> persistencia.
- `src/exchanges`: contrato común y adaptadores real/paper.
- `src/risk`: perfiles, sizing, stops y kill switch.
- `src/backtesting`: simulación histórica y métricas.
- `src/market-data`: velas y recolección de mercado.
- `src/dashboard`: agregación analítica.
- `src/analytics`: métricas unificadas para BotRunner v2 y cálculos financieros puros.
- `src/reconciliation`: comparación periódica del estado local con el exchange.
- `src/market-regime`: detección de tendencia, volatilidad, volumen y filtros de entrada.
- `src/market-prediction`: predicción estadística de precio (AR+GARCH) y su validación walk-forward.
- `prisma/schema.prisma`: esquema canónico. No usar `schema copy.prisma`.

### Nota: dos módulos de riesgo con nombres parecidos

`src/risk` y `src/risk-manager` son módulos **distintos**, ambos con una clase
`RiskManagerService` (en archivos distintos, no es el mismo código):

- `src/risk/risk-manager.service.ts`: gate **por señal**, consultado inline por
  `BotRunnerService` en cada ciclo (`RiskProfile`, sizers, `KillSwitch` por
  scope GLOBAL/BOT). Es el motor de riesgo de la regla #3.
- `src/risk-manager/risk-manager.service.ts`: watchdog **global/agregado**,
  cron cada 10s sobre `RiskConfig` (singleton), cubre límites de cartera
  (`maxDailyLossQuote`, `maxCrossBotExposurePct`, `consecutiveLossLimit`,
  `minWinRatePct`, `maxOpenBots`, `maxCrossBotExposurePct`). Agrega bots legacy
  (`BotRun`/`TradeResult`/`BotMetric`) y bots v2 (`BotRunnerRun`/`BotRunnerTrade`,
  incluida la exposición cruzada vía notional real `entryPrice*quantity` de
  posiciones abiertas) y puede detener ambos.

Al tocar cualquiera de los dos, verificar cuál es el que realmente aplica al
caso (por-señal vs agregado-global) antes de asumir que es el otro.

## Reglas financieras y de seguridad

1. Una ruta que coloca/cancela órdenes, cambia riesgo, inicia/detiene bots o revela balances nunca debe ser pública.
2. El modo real debe ser explícito. Una función nueva se prueba primero en paper.
3. Toda orden debe pasar por el motor de riesgo; no llamar al exchange directamente desde una estrategia.
4. No registrar API keys, secretos, contraseñas, JWT ni URLs firmadas.
5. Dinero, cantidades, precios y comisiones se persisten como `Decimal`; evitar `Float` para contabilidad.
6. Las operaciones externas deben ser idempotentes o incluir una clave de correlación.
7. No ocultar errores de persistencia que impidan auditar una operación real.

## Convención de trazabilidad

Cada ciclo accionable del runner usa un `correlationId`. Los eventos se guardan en `BotRunnerTrace` en este orden esperado:

1. `SIGNAL_EMITTED`
2. `RISK_ALLOWED`, `RISK_ADJUSTED` o `RISK_REJECTED`
3. `ORDER_REQUESTED`
4. `ORDER_ACCEPTED`, `ORDER_FILLED` u `ORDER_FAILED`
5. `TRADE_OPENED` o `TRADE_CLOSED`

El payload debe ser JSON serializable y nunca contener credenciales. Al ampliar el runner, continuar la misma correlación en vez de crear registros desconectados.

## Flujo para cambios de Prisma

1. Modificar `prisma/schema.prisma`.
2. Crear una migración SQL nueva; no editar migraciones aplicadas.
3. Ejecutar `npx prisma generate`.
4. Validar con `npx prisma validate` y las pruebas.
5. Actualizar API, pruebas y este documento cuando cambie una convención.

## Hoja de ruta de integraciones

- [x] Trazabilidad base de señal, riesgo, orden y trade en BotRunner v2.
- [x] Analítica unificada por estrategia/símbolo/periodo.
- [x] Clasificación y filtro de régimen de mercado.
- [x] Motor de confluencia y confianza de señales (`ConfluenceService` ya existía; `config.confluenceFilter` lo conecta como gate opcional del bot runner, con el forecast AR+GARCH integrable como componente del score).
- [x] Contexto y filtro multi-timeframe.
- [x] Riesgo agregado de cartera (daily-loss/open-bots/consecutive-loss/win-rate/cross-exposure ya agregan v1+v2 en `src/risk-manager`). Correlación entre runners ya existe (`AnalyticsService.runnerCorrelation`), falta usarla como input del propio watchdog.
- [x] Predicción estadística de precio (AR+GARCH) con validación walk-forward.
- [x] Reconciliación base de órdenes, posiciones y snapshots de balances.
- [x] Slippage, spread, latencia, comisiones y costo neto base.
- [x] Intereses de margin (`WalletSyncService.syncInterest`, ya existía) y funding de futuros perpetuos (`syncFunding`, nuevo -- `BinanceWalletHistoryService.fetchFundingFees` sobre `/fapi/v1/income`, `CapitalEvent.type = 'FUNDING'`).
- [x] Comparación backtest/paper/real (`AnalyticsService.compareModes()`; desde que el backtest aplica regimeFilter/multiTimeframe/priceForecast/confluenceFilter/riskProfile igual que en vivo, la comparación deja de ser "pelado vs con filtros").
- [x] Walk-forward y Monte Carlo (walk-forward de accuracy del forecast de precio vía `evaluateAccuracy()`; Monte Carlo de riesgo de ruina sobre la curva de equity vía `AnalyticsService.monteCarlo()`. Pendiente si se necesita walk-forward de *optimización de parámetros de estrategia*, que es un alcance distinto).
- [ ] Alertas operativas con deduplicación.
- [x] Dashboard analítico y salud del sistema (`AnalyticsService.dashboardV2()` + `systemHealth()`; `GET /analytics/dashboard` -- el dashboard legacy en `/stats/dashboard` sigue existiendo aparte, solo ve bots v1).

## Convención de analítica

- La fuente actual son operaciones cerradas de `BotRunnerTrade`.
- `pnl` es neto de la comisión almacenada; `grossPnlBeforeFees = netPnl + totalFees`.
- Los filtros temporales se aplican a `closedAt`.
- `profitFactor` es `null` cuando no existen pérdidas, para evitar `Infinity` en JSON.
- Sharpe y Sortino usan retornos por trade y escalado por raíz del número de trades; no deben presentarse como ratios anualizados por tiempo.
- La curva agregada suma capital inicial de los runners seleccionados y aplica el PnL cerrado cronológicamente.

## Convención de calidad de ejecución

- `ExecutionMetric` guarda un intento por `correlationId`, incluido el rechazo.
- `expectedPrice` es el precio límite solicitado o el midpoint observado antes de una orden market.
- Slippage positivo significa costo adverso tanto para BUY como SELL; negativo significa mejora de precio.
- `slippageQuote` usa la misma convención de signo y se calcula sobre la cantidad llenada.
- La latencia mide desde inmediatamente antes de `placeOrder` hasta recibir respuesta del adaptador.
- El spread se calcula como `(ask - bid) / midpoint * 10_000`.
- Las comisiones deben proceder del exchange/fill; nunca estimarlas silenciosamente en modo real.

## Convención de reconciliación

- Se ejecuta cada cinco minutos para runners activos y también puede iniciarse manualmente.
- Toda discrepancia tiene un fingerprint estable para evitar alertas duplicadas; `occurrenceCount` registra recurrencia.
- Solo se autorrepara una transición local pendiente (`NEW`/`PARTIALLY_FILLED`) cuando el exchange confirma un estado terminal.
- Nunca crear/cerrar trades, ajustar posiciones o modificar balances automáticamente a partir de una discrepancia ambigua.
- Una orden `FILLED` sin traza de trade es una incidencia crítica y requiere revisión manual.
- Posiciones y balances remotos quedan guardados como snapshot en cada lote.
- Estado remoto regresivo o contradictorio siempre es `CRITICAL` y `REQUIRES_MANUAL`.

## Convención de régimen de mercado

- Se requieren al menos 50 velas; con menos datos el resultado debe ser `UNKNOWN`.
- Tendencia combina EMA20/EMA50, separación porcentual y efficiency ratio.
- Volatilidad compara ATR14 porcentual con el rango porcentual mediano reciente.
- Volumen compara la última vela con el promedio de las 20 anteriores.
- El resultado se guarda una vez por símbolo, timeframe y cierre de vela.
- Las salidas nunca se bloquean por régimen; el filtro solo afecta `OPEN` y `ADJUST`.
- El filtro se configura dentro de `config.regimeFilter`, por ejemplo:

```json
{
  "regimeFilter": {
    "enabled": true,
    "allowedTrends": ["BULL_TREND", "RANGE"],
    "blockedVolatility": ["HIGH"],
    "minConfidence": 60,
    "allowUnknown": false
  }
}
```

La confluencia multi-timeframe se configura en `config.multiTimeframe`:

```json
{
  "multiTimeframe": {
    "enabled": true,
    "contexts": [
      { "timeframe": "1h", "weight": 2 },
      { "timeframe": "4h", "weight": 3 }
    ],
    "minScore": 65,
    "minConfidence": 55,
    "allowUnknown": false,
    "warmupBars": 100
  }
}
```

El timeframe primario siempre participa con peso 1. Solo `OPEN` y `ADJUST` pueden bloquearse; los cierres permanecen libres.

## Convención de estado de cuenta (ledger)

- `CapitalEvent` (single-entry, conectado al bot runner) es la fuente de verdad del movimiento de capital por tipo: `TRADE_PNL` (bruto), `FEE` (negativo), `FUNDING`, `INTEREST`, `REBATE`, `DEPOSIT`, `WITHDRAWAL`, `ADJUSTMENT`.
- No usar `Account`/`AccountBalance`/`JournalEntry`/`JournalEntryLine` para bots: ese esquema modela cuentas reales de usuario con credenciales de exchange (`key`/`secretKey`/`email`/`password` obligatorios) para `TradingOrder` manual, no un plan de cuentas interno. Forzar ahí categorías contables del bot violaría la regla #4.
- El estado de cuenta (`AnalyticsService.statement()`, `GET /analytics/statement` y `/analytics/statement.csv`) calcula el balance de apertura/cierre por moneda como `initialEquity` del runner (asignado a la moneda quote implícita de su símbolo) más la suma cronológica de `CapitalEvent`. Si el filtro `from` cae a mitad de un runner, el balance de apertura arrastra todo lo ocurrido antes de esa fecha -- nunca resetea a `initialEquity` del runner completo.
- Nunca mezclar monedas en un mismo acumulado: cada bucket de balance es por moneda.
- `reconciliation.service.ts#captureBalances` compara ese balance local contra el balance real del exchange, pero **solo en mercado SPOT** (en MARGIN/FUTURES el balance remoto incluye PnL no realizado de posiciones abiertas que el ledger, solo-realizado, no modela -- comparar ahí daría falsos positivos). Nunca autocorrige: toda discrepancia de balance queda `REQUIRES_MANUAL` (remoto por debajo de lo esperado = `CRITICAL`; por encima = `HIGH`, podría ser un depósito externo no reflejado).
- `WalletSyncService` (cron horario) sincroniza desde Binance los `CapitalEvent` que no nacen de un trade propio: `INTEREST` (margin), `FUNDING` (futuros perpetuos, `/fapi/v1/income` con `incomeType=FUNDING_FEE`, signo ya viene de Binance), `REBATE`, `DEPOSIT`, `WITHDRAWAL` (+ `FEE` de la withdrawal si aplica). Todo idempotente vía `externalId` único por fuente.

## Convención de predicción de precio

- Modelo: AR(p) sobre log-retornos para el nivel de precio + GARCH(1,1) sobre los mismos retornos para la volatilidad del horizonte (`src/market-prediction/price-forecast.calculator.ts`). Deliberadamente sin librerías de ML de caja negra -- cada coeficiente es auditable, acorde a la regla de poder explicar cada decisión del sistema.
- Requiere mínimo `MIN_SAMPLES` (120) velas cerradas; con menos, el resultado es `INSUFFICIENT_DATA` (mismo criterio que `MarketRegimeSnapshot` con sus 50 velas mínimas).
- El intervalo de confianza del 95% se deriva de la varianza GARCH pronosticada del horizonte acumulado, no de una varianza constante -- se ensancha solo cuando el mercado está más volátil.
- Es una ventaja probabilística, **no una garantía**: el resultado nunca coloca ni ajusta una orden por sí mismo. Solo alimenta el filtro opcional `config.priceForecast` (`{ enabled, horizonBars, maxDivergencePct, allowInsufficientData }`), que bloquea una señal `OPEN`/`ADJUST` si el forecast espera un movimiento en contra de la señal mayor a `maxDivergencePct`% -- igual que `config.regimeFilter`, nunca bloquea cierres y la señal que pasa sigue yendo íntegramente por el motor de riesgo (`gateSignal`/`RiskManagerService.check`).
- Falla abierto (permite la señal) ante cualquier error de cómputo o de lectura -- un filtro auxiliar no debe convertirse en una fuente nueva de caídas del bot. Solo bloquea por datos insuficientes si `allowInsufficientData: false` se configuró explícitamente.
- `PriceForecastService.evaluateAccuracy()` hace la validación walk-forward: completa `realizedPrice` de snapshots cuyo horizonte ya venció y devuelve MAE/RMSE/accuracy direccional agregados. **No activar `config.priceForecast.enabled` en un bot real sin antes revisar esta métrica** sobre el símbolo/timeframe/horizonte en cuestión -- es la manera de evitar que el forecast cause pérdidas por sobreajuste en vez de prevenirlas.
- `PriceForecastService.accuracySummary()` es la variante de solo lectura (sin completar `realizedPrice`) pensada para consultarse en el hot path del bot runner sin cargarle un write de reconciliación a cada señal.
- `ConfluenceService.compute()` puede incluir el forecast como un cuarto componente del score (`computeConfluence(..., config, forecast)`) cuando `config.usePriceForecast: true` -- sin ese flag, el score de confluencia es idéntico al de antes de que existiera el forecast (compatibilidad hacia atrás por defecto). El componente satura en ±2% de cambio esperado, mismo peso configurable (`weights.priceForecast`, default 0.2) que el resto de componentes.
- `config.confluenceFilter: { enabled, minScore, minConfidence, allowNeutral, usePriceForecast, priceForecastHorizonBars }` en el bot runner (`BotRunnerService.checkConfluence`) es un gate adicional e independiente de `regimeFilter`/`multiTimeframe`/`priceForecast` -- no los reemplaza, pueden convivir todos prendidos a la vez. BUY necesita `score >= minScore`; SELL necesita `score <= 100-minScore`; bias `NEUTRAL` bloquea salvo `allowNeutral: true`. Recalcula régimen/MTF por su cuenta (no reusa los ya calculados en el mismo tick por bot-runner) -- costo de cómputo extra aceptado, apagado por defecto. Falla abierto ante error, igual que el resto de filtros.

## Convención de sizing por confianza del forecast

- `config.priceForecast.sizeConfidence: { enabled, minSampleSize, floorMultiplier, ceilingMultiplier }` (anidado dentro de `config.priceForecast`, requiere que `priceForecast.enabled` también esté activo) traduce el accuracy direccional walk-forward de `accuracySummary()` en un multiplicador de tamaño de posición vía `computeConfidenceMultiplier()` (`src/market-prediction/price-forecast.calculator.ts`).
- 50% de accuracy (moneda al aire) = multiplicador 1 (neutral). Por encima escala linealmente hacia `ceilingMultiplier`, por debajo hacia `floorMultiplier`, siempre clampeado. Con menos de `minSampleSize` evaluaciones walk-forward, el multiplicador es 1 -- no hay suficiente evidencia para confiar en el número.
- El multiplicador se guarda en `signal.metadata.forecastSizeMultiplier` (`BotRunnerService.checkPriceForecast`) y se aplica en `RiskManagerService.check()` (`src/risk/risk-manager.service.ts`) **después** de que el sizer (Kelly/ATR-vol/fixed-pct) ya calculó el tamaño, escalando lo que sea que haya en `quoteQuantity`/`quantity` -- nunca inventa un valor que la señal no tenía. El cap de `maxPositionSizePct`/`freeMargin` sigue aplicándose después del multiplicador, así que un `ceilingMultiplier` agresivo nunca se salta el techo de riesgo ya configurado.
- Solo se calcula cuando la señal ya pasó el filtro de divergencia de `config.priceForecast` (una señal rechazada nunca llega a esta parte).

## Convención de Monte Carlo (riesgo de ruina)

- `AnalyticsService.monteCarlo()` / `GET /analytics/monte-carlo` (`src/analytics/monte-carlo.calculator.ts`) resamplea con reemplazo el PnL neto de trades ya cerrados que matchean los filtros, para proyectar la curva de equity `horizonTrades` operaciones hacia adelante. Convención aditiva (`equity += pnl_resampleado`), igual que `analytics-calculator.ts` -- no geométrica.
- Requiere mínimo 20 trades cerrados; con menos, devuelve `INSUFFICIENT_DATA` en vez de simular sobre una muestra que no significa nada.
- Si `filters.runId` apunta a un único runner con `RiskProfile`, usa su `maxDrawdownPct` como umbral para `probabilityOfBreachingMaxDrawdownPct` -- no inventa un umbral si no hay uno configurado.
- Es una proyección basada en el propio historial de la cuenta (contabilidad), no en precio -- complementa, no reemplaza, la predicción de precio AR+GARCH.

## Convención de paridad backtest/vivo

- `RunBacktestDto.config` es el mismo blob plano que `BotRunnerRun.config` en vivo: las mismas claves `regimeFilter`/`multiTimeframe`/`priceForecast`/`confluenceFilter` que `BotRunnerService` lee para gatear señales, más una clave nueva solo-backtest `riskProfile` (objeto inline con forma de `RiskProfile`, no un id de DB) para aplicar sizing. Todo opcional: un backtest sin ninguna de estas claves se comporta exactamente igual que antes de que existiera este bloque.
- `src/backtesting/engine/filters.ts#applyEntryFilters()` reusa las mismas funciones puras que el bot runner (`detectMarketRegime`/`regimeAllowsFilter`, `evaluateTimeframeAlignment`, `forecastPrice`, `computeConfluence`) sobre el slice de velas hasta la barra actual -- sin look-ahead, sin ir a DB/exchange en el loop. `confluenceFilter` replica el default de `ConfluenceService` (1h/4h, `DEFAULT_EXTRA_TIMEFRAMES`) salvo que `confluenceFilter.extraTimeframes` lo override.
- `BacktestingService.run()` precarga las velas de timeframes extra que `multiTimeframe`/`confluenceFilter` necesiten (unión deduplicada, una sola carga para todo el rango) y se las pasa al simulador vía `extraTimeframeCandles`.
- `config.riskProfile` activa `RiskManagerService.check()` **dentro del loop del backtest** (misma clase que usa `BotRunnerService` en vivo, instanciada sin PrismaClient real porque `check()` nunca toca la DB cuando el profile se pasa inline) -- aplica sizer + cap de `maxPositionSizePct`/`freeMargin`/`maxDrawdownPct`/`maxDailyLossPct` igual que en vivo. **No** simula el kill-switch/watchdog global (`killSwitchEnabled` siempre `false`): eso reacciona a pérdidas reales en vivo, no tiene un equivalente limpio para "replayear" dentro de un backtest.
- `SimulatorResult.filteredSignals` cuenta las señales `OPEN` que la estrategia emitió pero que algún filtro o el risk check bloquearon -- sin esto, un backtest con filtros muy estrictos podía dar "0 trades" sin ninguna pista de si fue la estrategia o un filtro.
- Bug encontrado y arreglado en el camino: `RiskManagerService.check()` usaba `signal.price ?? 0` para el sizer -- una señal `MARKET` (el caso común, `sma-cross.strategy.ts` incluido) nunca trae `.price`, así que **cualquier bot en vivo con `RiskProfile.sizer` configurado rechazaba el 100% de sus entradas** con `sizer produced zero`. Ahora cae a `history[history.length-1].close` cuando `signal.price` falta.

## Criterio de terminado

Una integración está terminada cuando tiene persistencia/migración si aplica, contrato tipado, API o consumidor, pruebas del camino feliz y fallos importantes, documentación y verificación de compilación. No declarar terminada una función financiera probada únicamente con mocks si existe un modo paper adecuado.
