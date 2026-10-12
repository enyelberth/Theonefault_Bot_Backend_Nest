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
  `minWinRatePct`, `maxOpenBots`). Agrega bots legacy (`BotRun`/`TradeResult`)
  y bots v2 (`BotRunnerRun`/`BotRunnerTrade` vía `BotRunnerService.list()`) y
  puede detener ambos. La exposición cruzada agregada (`maxCrossBotExposurePct`)
  todavía solo cuenta bots legacy -- pendiente de dato de notional por runner v2.

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
- [ ] Motor de confluencia y confianza de señales.
- [x] Contexto y filtro multi-timeframe.
- [ ] Riesgo agregado de cartera y correlación (parcial: daily-loss/open-bots/consecutive-loss/win-rate ya agregan v1+v2 en `src/risk-manager`; exposición cruzada por notional sigue solo v1).
- [x] Predicción estadística de precio (AR+GARCH) con validación walk-forward.
- [x] Reconciliación base de órdenes, posiciones y snapshots de balances.
- [x] Slippage, spread, latencia, comisiones y costo neto base.
- [ ] Intereses de margin y funding de futuros.
- [ ] Comparación backtest/paper/real.
- [ ] Walk-forward y Monte Carlo.
- [ ] Alertas operativas con deduplicación.
- [ ] Dashboard analítico y salud del sistema.

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

## Convención de predicción de precio

- Modelo: AR(p) sobre log-retornos para el nivel de precio + GARCH(1,1) sobre los mismos retornos para la volatilidad del horizonte (`src/market-prediction/price-forecast.calculator.ts`). Deliberadamente sin librerías de ML de caja negra -- cada coeficiente es auditable, acorde a la regla de poder explicar cada decisión del sistema.
- Requiere mínimo `MIN_SAMPLES` (120) velas cerradas; con menos, el resultado es `INSUFFICIENT_DATA` (mismo criterio que `MarketRegimeSnapshot` con sus 50 velas mínimas).
- El intervalo de confianza del 95% se deriva de la varianza GARCH pronosticada del horizonte acumulado, no de una varianza constante -- se ensancha solo cuando el mercado está más volátil.
- Es una ventaja probabilística, **no una garantía**: el resultado nunca coloca ni ajusta una orden por sí mismo. Solo alimenta el filtro opcional `config.priceForecast` (`{ enabled, horizonBars, maxDivergencePct, allowInsufficientData }`), que bloquea una señal `OPEN`/`ADJUST` si el forecast espera un movimiento en contra de la señal mayor a `maxDivergencePct`% -- igual que `config.regimeFilter`, nunca bloquea cierres y la señal que pasa sigue yendo íntegramente por el motor de riesgo (`gateSignal`/`RiskManagerService.check`).
- Falla abierto (permite la señal) ante cualquier error de cómputo o de lectura -- un filtro auxiliar no debe convertirse en una fuente nueva de caídas del bot. Solo bloquea por datos insuficientes si `allowInsufficientData: false` se configuró explícitamente.
- `PriceForecastService.evaluateAccuracy()` hace la validación walk-forward: completa `realizedPrice` de snapshots cuyo horizonte ya venció y devuelve MAE/RMSE/accuracy direccional agregados. **No activar `config.priceForecast.enabled` en un bot real sin antes revisar esta métrica** sobre el símbolo/timeframe/horizonte en cuestión -- es la manera de evitar que el forecast cause pérdidas por sobreajuste en vez de prevenirlas.

## Criterio de terminado

Una integración está terminada cuando tiene persistencia/migración si aplica, contrato tipado, API o consumidor, pruebas del camino feliz y fallos importantes, documentación y verificación de compilación. No declarar terminada una función financiera probada únicamente con mocks si existe un modo paper adecuado.
