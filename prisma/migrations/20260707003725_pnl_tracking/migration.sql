-- CreateEnum
CREATE TYPE "BotRunStatus" AS ENUM ('RUNNING', 'STOPPED', 'ERROR');

-- CreateTable
CREATE TABLE "BotRun" (
    "id" SERIAL NOT NULL,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyType" TEXT,
    "status" "BotRunStatus" NOT NULL DEFAULT 'RUNNING',
    "initialQuote" DECIMAL(65,30),
    "configSnapshot" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "BotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotMetric" (
    "id" SERIAL NOT NULL,
    "botRunId" INTEGER NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "realizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "openPositions" INTEGER NOT NULL DEFAULT 0,
    "tradesCount" INTEGER NOT NULL DEFAULT 0,
    "winCount" INTEGER NOT NULL DEFAULT 0,
    "lossCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrice" DECIMAL(65,30),
    "extra" JSONB,

    CONSTRAINT "BotMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeResult" (
    "id" SERIAL NOT NULL,
    "botRunId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "entryPrice" DECIMAL(65,30) NOT NULL,
    "exitPrice" DECIMAL(65,30) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "pnl" DECIMAL(65,30) NOT NULL,
    "pnlPct" DECIMAL(65,30) NOT NULL,
    "fees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotRun_strategyId_idx" ON "BotRun"("strategyId");

-- CreateIndex
CREATE INDEX "BotRun_symbol_status_idx" ON "BotRun"("symbol", "status");

-- CreateIndex
CREATE INDEX "BotRun_startedAt_idx" ON "BotRun"("startedAt");

-- CreateIndex
CREATE INDEX "BotMetric_botRunId_ts_idx" ON "BotMetric"("botRunId", "ts");

-- CreateIndex
CREATE INDEX "TradeResult_botRunId_closedAt_idx" ON "TradeResult"("botRunId", "closedAt");

-- CreateIndex
CREATE INDEX "TradeResult_symbol_closedAt_idx" ON "TradeResult"("symbol", "closedAt");

-- AddForeignKey
ALTER TABLE "BotRun" ADD CONSTRAINT "BotRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "TradingStrategy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotMetric" ADD CONSTRAINT "BotMetric_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeResult" ADD CONSTRAINT "TradeResult_botRunId_fkey" FOREIGN KEY ("botRunId") REFERENCES "BotRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeResult" ADD CONSTRAINT "TradeResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TradingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
