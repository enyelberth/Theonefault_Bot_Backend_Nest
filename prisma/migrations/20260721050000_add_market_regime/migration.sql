CREATE TABLE "MarketRegimeSnapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "candleCloseTime" TIMESTAMP(3) NOT NULL,
    "regime" TEXT NOT NULL,
    "trend" TEXT NOT NULL,
    "volatility" TEXT NOT NULL,
    "volume" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "trendStrengthPct" DOUBLE PRECISION,
    "atrPct" DOUBLE PRECISION,
    "efficiencyRatio" DOUBLE PRECISION,
    "volumeRatio" DOUBLE PRECISION,
    "indicators" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketRegimeSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BotRunnerTrade"
ADD COLUMN "marketRegime" TEXT,
ADD COLUMN "regimeConfidence" DOUBLE PRECISION,
ADD COLUMN "regimeSnapshot" JSONB;

CREATE UNIQUE INDEX "MarketRegimeSnapshot_symbol_timeframe_candleCloseTime_key"
ON "MarketRegimeSnapshot"("symbol", "timeframe", "candleCloseTime");
CREATE INDEX "MarketRegimeSnapshot_symbol_timeframe_candleCloseTime_idx"
ON "MarketRegimeSnapshot"("symbol", "timeframe", "candleCloseTime");
CREATE INDEX "MarketRegimeSnapshot_regime_candleCloseTime_idx"
ON "MarketRegimeSnapshot"("regime", "candleCloseTime");
