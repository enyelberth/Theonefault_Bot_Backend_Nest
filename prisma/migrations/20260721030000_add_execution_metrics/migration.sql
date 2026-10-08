CREATE TABLE "ExecutionMetric" (
    "id" SERIAL NOT NULL,
    "botRunnerRunId" INTEGER NOT NULL,
    "correlationId" TEXT NOT NULL,
    "orderId" TEXT,
    "exchange" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "orderType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expectedPrice" DECIMAL(65,30),
    "bestBid" DECIMAL(65,30),
    "bestAsk" DECIMAL(65,30),
    "spreadBps" DECIMAL(65,30),
    "requestedQuantity" DECIMAL(65,30),
    "filledQuantity" DECIMAL(65,30),
    "fillPrice" DECIMAL(65,30),
    "notional" DECIMAL(65,30),
    "fee" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "feeCurrency" TEXT,
    "slippageBps" DECIMAL(65,30),
    "slippageQuote" DECIMAL(65,30),
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExecutionMetric_correlationId_key"
ON "ExecutionMetric"("correlationId");

CREATE INDEX "ExecutionMetric_botRunnerRunId_requestedAt_idx"
ON "ExecutionMetric"("botRunnerRunId", "requestedAt");

CREATE INDEX "ExecutionMetric_symbol_requestedAt_idx"
ON "ExecutionMetric"("symbol", "requestedAt");

CREATE INDEX "ExecutionMetric_status_requestedAt_idx"
ON "ExecutionMetric"("status", "requestedAt");

CREATE INDEX "ExecutionMetric_mode_requestedAt_idx"
ON "ExecutionMetric"("mode", "requestedAt");

ALTER TABLE "ExecutionMetric"
ADD CONSTRAINT "ExecutionMetric_botRunnerRunId_fkey"
FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
