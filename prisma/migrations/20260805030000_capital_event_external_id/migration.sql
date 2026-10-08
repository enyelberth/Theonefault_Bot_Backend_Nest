-- Idempotent sync from exchange wallet history.
ALTER TABLE "CapitalEvent" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "CapitalEvent_source_externalId_key"
  ON "CapitalEvent"("source", "externalId");
