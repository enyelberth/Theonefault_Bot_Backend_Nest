ALTER TABLE "ExecutionMetric"
ADD COLUMN "market" TEXT NOT NULL DEFAULT 'SPOT';

CREATE TABLE "ReconciliationBatch" (
    "id" SERIAL NOT NULL,
    "botRunnerRunId" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "exchange" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "ordersChecked" INTEGER NOT NULL DEFAULT 0,
    "positionsChecked" INTEGER NOT NULL DEFAULT 0,
    "balancesChecked" INTEGER NOT NULL DEFAULT 0,
    "issuesFound" INTEGER NOT NULL DEFAULT 0,
    "repairsApplied" INTEGER NOT NULL DEFAULT 0,
    "balanceSnapshot" JSONB,
    "positionSnapshot" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReconciliationIssue" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "batchId" INTEGER NOT NULL,
    "botRunnerRunId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "localState" JSONB,
    "remoteState" JSONB,
    "action" TEXT NOT NULL DEFAULT 'REQUIRES_MANUAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "resolution" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReconciliationIssue_fingerprint_key"
ON "ReconciliationIssue"("fingerprint");
CREATE INDEX "ReconciliationBatch_botRunnerRunId_startedAt_idx"
ON "ReconciliationBatch"("botRunnerRunId", "startedAt");
CREATE INDEX "ReconciliationBatch_status_startedAt_idx"
ON "ReconciliationBatch"("status", "startedAt");
CREATE INDEX "ReconciliationIssue_botRunnerRunId_status_lastSeenAt_idx"
ON "ReconciliationIssue"("botRunnerRunId", "status", "lastSeenAt");
CREATE INDEX "ReconciliationIssue_severity_status_lastSeenAt_idx"
ON "ReconciliationIssue"("severity", "status", "lastSeenAt");
CREATE INDEX "ReconciliationIssue_type_status_idx"
ON "ReconciliationIssue"("type", "status");

ALTER TABLE "ReconciliationBatch"
ADD CONSTRAINT "ReconciliationBatch_botRunnerRunId_fkey"
FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationIssue"
ADD CONSTRAINT "ReconciliationIssue_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "ReconciliationBatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliationIssue"
ADD CONSTRAINT "ReconciliationIssue_botRunnerRunId_fkey"
FOREIGN KEY ("botRunnerRunId") REFERENCES "BotRunnerRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
