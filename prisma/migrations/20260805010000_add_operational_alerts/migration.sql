-- Dedupe alerts for operational events (kill-switch trip, order fails, etc.)
CREATE TABLE "OperationalAlert" (
  "id"              SERIAL NOT NULL,
  "kind"            TEXT NOT NULL,
  "severity"        TEXT NOT NULL DEFAULT 'INFO',
  "subject"         TEXT NOT NULL,
  "message"         TEXT NOT NULL,
  "dedupeKey"       TEXT NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "botRunnerRunId"  INTEGER,
  "payload"         JSONB,
  "firstOccurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastOccurredAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt"  TIMESTAMP(3),
  "acknowledgedBy"  TEXT,
  CONSTRAINT "OperationalAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalAlert_dedupeKey_key"
  ON "OperationalAlert"("dedupeKey");

CREATE INDEX "OperationalAlert_kind_lastOccurredAt_idx"
  ON "OperationalAlert"("kind", "lastOccurredAt");

CREATE INDEX "OperationalAlert_severity_acknowledgedAt_idx"
  ON "OperationalAlert"("severity", "acknowledgedAt");

CREATE INDEX "OperationalAlert_botRunnerRunId_idx"
  ON "OperationalAlert"("botRunnerRunId");
