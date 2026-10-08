-- Unified ledger: every money movement (pnl, fees, funding, interest, deposits, withdrawals) as one row.
CREATE TABLE "CapitalEvent" (
  "id"             SERIAL NOT NULL,
  "type"           TEXT NOT NULL,
  "amount"         DECIMAL(65,30) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'USDT',
  "botRunnerRunId" INTEGER,
  "tradeId"        INTEGER,
  "correlationId"  TEXT,
  "source"         TEXT,
  "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload"        JSONB,
  CONSTRAINT "CapitalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CapitalEvent_type_occurredAt_idx" ON "CapitalEvent"("type", "occurredAt");
CREATE INDEX "CapitalEvent_botRunnerRunId_occurredAt_idx" ON "CapitalEvent"("botRunnerRunId", "occurredAt");
CREATE INDEX "CapitalEvent_tradeId_idx" ON "CapitalEvent"("tradeId");
CREATE INDEX "CapitalEvent_correlationId_idx" ON "CapitalEvent"("correlationId");
