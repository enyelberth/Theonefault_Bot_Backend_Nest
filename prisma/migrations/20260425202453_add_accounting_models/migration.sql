-- Add commission fields to TradingExecution
ALTER TABLE "TradingExecution" ADD COLUMN "commission" NUMERIC(18,8),
ADD COLUMN "commissionAsset" VARCHAR(20);

-- Add commission fields to TradingOrder
ALTER TABLE "TradingOrder" ADD COLUMN "commissionAsset" VARCHAR(20),
ADD COLUMN "commissionAmount" NUMERIC(18,8);

-- Create OpenLotPosition table
CREATE TABLE "open_lot_position" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "entryOrderId" INTEGER NOT NULL UNIQUE,
    "remainingQty" NUMERIC(18,8) NOT NULL,
    "avgEntryPrice" NUMERIC(18,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on OpenLotPosition
CREATE INDEX "open_lot_position_strategyId_symbol_idx" ON "open_lot_position"("strategyId", "symbol");

-- Create StrategyStatSnapshot table
CREATE TABLE "strategy_stat_snapshot" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL UNIQUE,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "filledOrders" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
    "realizedPnl" NUMERIC(18,8) NOT NULL DEFAULT 0,
    "winningTrades" INTEGER NOT NULL DEFAULT 0,
    "losingTrades" INTEGER NOT NULL DEFAULT 0,
    "winRate" NUMERIC(5,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create TradePnlRecord table
CREATE TABLE "trade_pnl_record" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "entryOrderId" INTEGER NOT NULL,
    "exitOrderId" INTEGER NOT NULL UNIQUE,
    "entryAvgPrice" NUMERIC(18,8) NOT NULL,
    "exitAvgPrice" NUMERIC(18,8) NOT NULL,
    "quantity" NUMERIC(18,8) NOT NULL,
    "realizedPnl" NUMERIC(18,8) NOT NULL,
    "commissionEst" NUMERIC(18,8) NOT NULL DEFAULT 0,
    "netPnl" NUMERIC(18,8) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes on TradePnlRecord
CREATE INDEX "trade_pnl_record_strategyId_idx" ON "trade_pnl_record"("strategyId");
CREATE INDEX "trade_pnl_record_symbol_idx" ON "trade_pnl_record"("symbol");
CREATE INDEX "trade_pnl_record_closedAt_idx" ON "trade_pnl_record"("closedAt");
