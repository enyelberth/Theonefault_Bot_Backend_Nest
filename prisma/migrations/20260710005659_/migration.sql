-- CreateEnum
CREATE TYPE "CopyVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CopyMode" AS ENUM ('MIRROR', 'PROPORTIONAL', 'FIXED_QUOTE');

-- CreateEnum
CREATE TYPE "RunnerStatus" AS ENUM ('RUNNING', 'STOPPED', 'ERROR');

-- CreateTable
CREATE TABLE "CopyMaster" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "ownerId" INTEGER,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "CopyVisibility" NOT NULL DEFAULT 'PRIVATE',
    "performanceScore" DOUBLE PRECISION,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopySubscription" (
    "id" SERIAL NOT NULL,
    "masterId" INTEGER NOT NULL,
    "followerRunId" TEXT NOT NULL,
    "ownerId" INTEGER,
    "exchangeMode" TEXT NOT NULL,
    "exchangeId" TEXT,
    "paperAccountId" INTEGER,
    "mode" "CopyMode" NOT NULL DEFAULT 'PROPORTIONAL',
    "sizeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fixedQuote" DOUBLE PRECISION,
    "maxRiskPct" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyEvent" (
    "id" SERIAL NOT NULL,
    "masterId" INTEGER NOT NULL,
    "signal" JSONB NOT NULL,
    "fanoutCount" INTEGER NOT NULL DEFAULT 0,
    "emittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopyExecution" (
    "id" SERIAL NOT NULL,
    "copyEventId" INTEGER NOT NULL,
    "subscriptionId" INTEGER NOT NULL,
    "orderId" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "price" DECIMAL(65,30),
    "quantity" DECIMAL(65,30),
    "quoteQuantity" DECIMAL(65,30),
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopyExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRunnerRun" (
    "id" SERIAL NOT NULL,
    "runId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "ownerId" INTEGER,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "exchangeMode" TEXT NOT NULL,
    "exchangeId" TEXT,
    "paperAccountId" INTEGER,
    "riskProfileId" INTEGER,
    "status" "RunnerStatus" NOT NULL DEFAULT 'RUNNING',
    "config" JSONB NOT NULL,
    "initialEquity" DECIMAL(65,30),
    "peakEquity" DECIMAL(65,30),
    "finalEquity" DECIMAL(65,30),
    "dailyPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "ticks" INTEGER NOT NULL DEFAULT 0,
    "signals" INTEGER NOT NULL DEFAULT 0,
    "ordersPlaced" INTEGER NOT NULL DEFAULT 0,
    "ordersRejected" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "BotRunnerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRunnerTrade" (
    "id" SERIAL NOT NULL,
    "botRunnerRunId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "entryPrice" DECIMAL(65,30) NOT NULL,
    "exitPrice" DECIMAL(65,30),
    "quantity" DECIMAL(65,30) NOT NULL,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pnl" DECIMAL(65,30),
    "pnlPct" DECIMAL(65,30),
    "reason" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "BotRunnerTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotRunnerSnapshot" (
    "id" SERIAL NOT NULL,
    "botRunnerRunId" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equity" DECIMAL(65,30) NOT NULL,
    "drawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openPositions" INTEGER NOT NULL DEFAULT 0,
    "extras" JSONB,

    CONSTRAINT "BotRunnerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskProfile" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "name" TEXT NOT NULL,
    "maxDrawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "maxDailyLossPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "maxPositionSizePct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "maxOpenPositions" INTEGER NOT NULL DEFAULT 5,
    "sizer" JSONB,
    "trailingStop" JSONB,
    "tpLadder" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KillSwitch" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "targetId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "triggeredAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KillSwitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperAccount" (
    "id" SERIAL NOT NULL,
    "ownerId" INTEGER,
    "name" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL DEFAULT 'USDT',
    "initialQuote" DECIMAL(65,30) NOT NULL,
    "balances" JSONB NOT NULL,
    "feesConfig" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperFill" (
    "id" SERIAL NOT NULL,
    "paperAccountId" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "type" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "quoteQuantity" DECIMAL(65,30) NOT NULL,
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "feeAsset" TEXT,
    "reason" TEXT,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperFill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CopyMaster_runId_key" ON "CopyMaster"("runId");

-- CreateIndex
CREATE INDEX "CopyMaster_visibility_active_idx" ON "CopyMaster"("visibility", "active");

-- CreateIndex
CREATE INDEX "CopyMaster_ownerId_idx" ON "CopyMaster"("ownerId");

-- CreateIndex
CREATE INDEX "CopySubscription_followerRunId_idx" ON "CopySubscription"("followerRunId");

-- CreateIndex
CREATE INDEX "CopySubscription_active_idx" ON "CopySubscription"("active");

-- CreateIndex
CREATE UNIQUE INDEX "CopySubscription_masterId_followerRunId_key" ON "CopySubscription"("masterId", "followerRunId");

-- CreateIndex
CREATE INDEX "CopyEvent_masterId_emittedAt_idx" ON "CopyEvent"("masterId", "emittedAt");

-- CreateIndex
CREATE INDEX "CopyExecution_copyEventId_idx" ON "CopyExecution"("copyEventId");

-- CreateIndex
CREATE INDEX "CopyExecution_subscriptionId_executedAt_idx" ON "CopyExecution"("subscriptionId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BotRunnerRun_runId_key" ON "BotRunnerRun"("runId");

-- CreateIndex
CREATE INDEX "BotRunnerRun_status_idx" ON "BotRunnerRun"("status");

-- CreateIndex
CREATE INDEX "BotRunnerRun_ownerId_idx" ON "BotRunnerRun"("ownerId");

-- CreateIndex
CREATE INDEX "BotRunnerRun_symbol_startedAt_idx" ON "BotRunnerRun"("symbol", "startedAt");

-- CreateIndex
CREATE INDEX "BotRunnerTrade_botRunnerRunId_closedAt_idx" ON "BotRunnerTrade"("botRunnerRunId", "closedAt");

-- CreateIndex
CREATE INDEX "BotRunnerTrade_symbol_openedAt_idx" ON "BotRunnerTrade"("symbol", "openedAt");

-- CreateIndex
CREATE INDEX "BotRunnerSnapshot_botRunnerRunId_ts_idx" ON "BotRunnerSnapshot"("botRunnerRunId", "ts");

-- CreateIndex
CREATE INDEX "RiskProfile_ownerId_idx" ON "RiskProfile"("ownerId");

-- CreateIndex
CREATE INDEX "RiskProfile_enabled_idx" ON "RiskProfile"("enabled");

-- CreateIndex
CREATE INDEX "KillSwitch_enabled_idx" ON "KillSwitch"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "KillSwitch_scope_targetId_key" ON "KillSwitch"("scope", "targetId");

-- CreateIndex
CREATE INDEX "PaperAccount_ownerId_idx" ON "PaperAccount"("ownerId");

-- CreateIndex
CREATE INDEX "PaperAccount_active_idx" ON "PaperAccount"("active");

-- CreateIndex
CREATE INDEX "PaperFill_paperAccountId_filledAt_idx" ON "PaperFill"("paperAccountId", "filledAt");

-- CreateIndex
CREATE INDEX "PaperFill_symbol_filledAt_idx" ON "PaperFill"("symbol", "filledAt");

-- AddForeignKey
ALTER TABLE "CopySubscription" ADD CONSTRAINT "CopySubscription_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "CopyMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyEvent" ADD CONSTRAINT "CopyEvent_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "CopyMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyExecution" ADD CONSTRAINT "CopyExecution_copyEventId_fkey" FOREIGN KEY ("copyEventId") REFERENCES "CopyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyExecution" ADD CONSTRAINT "CopyExecution_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CopySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunnerTrade" ADD CONSTRAINT "BotRunnerTrade_botRunnerRunId_fkey" FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotRunnerSnapshot" ADD CONSTRAINT "BotRunnerSnapshot_botRunnerRunId_fkey" FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFill" ADD CONSTRAINT "PaperFill_paperAccountId_fkey" FOREIGN KEY ("paperAccountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
