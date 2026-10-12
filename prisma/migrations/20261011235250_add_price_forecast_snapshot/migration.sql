-- CreateTable
CREATE TABLE "PriceForecastSnapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "candleCloseTime" TIMESTAMP(3) NOT NULL,
    "horizonBars" INTEGER NOT NULL,
    "lastPrice" DECIMAL(65,30) NOT NULL,
    "forecastPrice" DECIMAL(65,30) NOT NULL,
    "lowerBound" DECIMAL(65,30) NOT NULL,
    "upperBound" DECIMAL(65,30) NOT NULL,
    "confidencePct" DOUBLE PRECISION NOT NULL,
    "volatilityForecast" DECIMAL(65,30) NOT NULL,
    "modelType" TEXT NOT NULL,
    "modelParams" JSONB,
    "samplesUsed" INTEGER NOT NULL,
    "realizedPrice" DECIMAL(65,30),
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceForecastSnapshot_symbol_timeframe_createdAt_idx" ON "PriceForecastSnapshot"("symbol", "timeframe", "createdAt");

-- CreateIndex
CREATE INDEX "PriceForecastSnapshot_realizedPrice_idx" ON "PriceForecastSnapshot"("realizedPrice");

-- CreateIndex
CREATE UNIQUE INDEX "PriceForecastSnapshot_symbol_timeframe_candleCloseTime_hori_key" ON "PriceForecastSnapshot"("symbol", "timeframe", "candleCloseTime", "horizonBars");
