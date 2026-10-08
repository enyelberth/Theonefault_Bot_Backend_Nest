-- CreateTable
CREATE TABLE "ConfluenceSnapshot" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "candleCloseTime" TIMESTAMP(3) NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "bias" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "regimeScore" DOUBLE PRECISION NOT NULL,
    "mtfScore" DOUBLE PRECISION NOT NULL,
    "momentumScore" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfluenceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConfluenceSnapshot_symbol_timeframe_candleCloseTime_idx" ON "ConfluenceSnapshot"("symbol", "timeframe", "candleCloseTime");

-- CreateIndex
CREATE INDEX "ConfluenceSnapshot_bias_candleCloseTime_idx" ON "ConfluenceSnapshot"("bias", "candleCloseTime");

-- CreateIndex
CREATE UNIQUE INDEX "ConfluenceSnapshot_symbol_timeframe_candleCloseTime_key" ON "ConfluenceSnapshot"("symbol", "timeframe", "candleCloseTime");
