CREATE TABLE "BotRunnerTrace" (
    "id" SERIAL NOT NULL,
    "botRunnerRunId" INTEGER NOT NULL,
    "correlationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "orderId" TEXT,
    "tradeId" INTEGER,
    "payload" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotRunnerTrace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BotRunnerTrace_botRunnerRunId_occurredAt_idx"
ON "BotRunnerTrace"("botRunnerRunId", "occurredAt");

CREATE INDEX "BotRunnerTrace_correlationId_occurredAt_idx"
ON "BotRunnerTrace"("correlationId", "occurredAt");

CREATE INDEX "BotRunnerTrace_eventType_occurredAt_idx"
ON "BotRunnerTrace"("eventType", "occurredAt");

CREATE INDEX "BotRunnerTrace_orderId_idx" ON "BotRunnerTrace"("orderId");

ALTER TABLE "BotRunnerTrace"
ADD CONSTRAINT "BotRunnerTrace_botRunnerRunId_fkey"
FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
