-- CreateEnum
CREATE TYPE "BacktestStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" SERIAL NOT NULL,
    "strategyId" TEXT NOT NULL,
    "strategyVersion" TEXT,
    "exchange" TEXT NOT NULL DEFAULT 'binance',
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "initialQuote" DECIMAL(65,30) NOT NULL,
    "finalQuote" DECIMAL(65,30),
    "config" JSONB NOT NULL,
    "fees" JSONB,
    "status" "BacktestStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "totalTrades" INTEGER,
    "winningTrades" INTEGER,
    "losingTrades" INTEGER,
    "winRate" DOUBLE PRECISION,
    "profitFactor" DOUBLE PRECISION,
    "sharpeRatio" DOUBLE PRECISION,
    "sortinoRatio" DOUBLE PRECISION,
    "maxDrawdownPct" DOUBLE PRECISION,
    "totalReturnPct" DOUBLE PRECISION,
    "expectancy" DOUBLE PRECISION,
    "metrics" JSONB,
    "equityCurve" JSONB,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestTrade" (
    "id" SERIAL NOT NULL,
    "backtestRunId" INTEGER NOT NULL,
    "side" "OrderSide" NOT NULL,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3) NOT NULL,
    "entryPrice" DECIMAL(65,30) NOT NULL,
    "exitPrice" DECIMAL(65,30) NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "pnl" DECIMAL(65,30) NOT NULL,
    "pnlPct" DECIMAL(65,30) NOT NULL,
    "fees" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "bars" INTEGER,

    CONSTRAINT "BacktestTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacktestRun_strategyId_idx" ON "BacktestRun"("strategyId");

-- CreateIndex
CREATE INDEX "BacktestRun_symbol_timeframe_idx" ON "BacktestRun"("symbol", "timeframe");

-- CreateIndex
CREATE INDEX "BacktestRun_status_idx" ON "BacktestRun"("status");

-- CreateIndex
CREATE INDEX "BacktestRun_createdAt_idx" ON "BacktestRun"("createdAt");

-- CreateIndex
CREATE INDEX "BacktestTrade_backtestRunId_exitTime_idx" ON "BacktestTrade"("backtestRunId", "exitTime");

-- AddForeignKey
ALTER TABLE "BacktestTrade" ADD CONSTRAINT "BacktestTrade_backtestRunId_fkey" FOREIGN KEY ("backtestRunId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
