CREATE TABLE "MultiTimeframeEvaluation" (
    "id" SERIAL NOT NULL, "botRunnerRunId" INTEGER NOT NULL,
    "correlationId" TEXT NOT NULL, "symbol" TEXT NOT NULL,
    "primaryTimeframe" TEXT NOT NULL, "side" "OrderSide" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL, "aligned" BOOLEAN NOT NULL,
    "contexts" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MultiTimeframeEvaluation_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BotRunnerTrade" ADD COLUMN "timeframeScore" DOUBLE PRECISION,
ADD COLUMN "timeframeSnapshot" JSONB;
CREATE UNIQUE INDEX "MultiTimeframeEvaluation_correlationId_key" ON "MultiTimeframeEvaluation"("correlationId");
CREATE INDEX "MultiTimeframeEvaluation_botRunnerRunId_createdAt_idx" ON "MultiTimeframeEvaluation"("botRunnerRunId", "createdAt");
CREATE INDEX "MultiTimeframeEvaluation_symbol_createdAt_idx" ON "MultiTimeframeEvaluation"("symbol", "createdAt");
ALTER TABLE "MultiTimeframeEvaluation" ADD CONSTRAINT "MultiTimeframeEvaluation_botRunnerRunId_fkey" FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
