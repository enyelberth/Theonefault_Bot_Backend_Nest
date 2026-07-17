-- CreateTable
CREATE TABLE "RiskConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxDailyLossQuote" DECIMAL(65,30),
    "maxDrawdownPct" DOUBLE PRECISION,
    "maxOpenBots" INTEGER,
    "maxLossPerBotQuote" DECIMAL(65,30),
    "minWinRatePct" DOUBLE PRECISION,
    "minTradesForWinRateEval" INTEGER NOT NULL DEFAULT 20,
    "emergencyStopUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "botRunId" INTEGER,
    "symbol" TEXT,
    "message" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskEvent_type_createdAt_idx" ON "RiskEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "RiskEvent_botRunId_idx" ON "RiskEvent"("botRunId");
