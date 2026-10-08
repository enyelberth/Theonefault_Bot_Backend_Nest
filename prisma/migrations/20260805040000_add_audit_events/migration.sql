CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "requestId" VARCHAR(80) NOT NULL,
    "eventType" VARCHAR(64) NOT NULL DEFAULT 'HTTP_REQUEST',
    "userId" INTEGER,
    "method" VARCHAR(12) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "ipAddress" VARCHAR(128),
    "userAgent" VARCHAR(512),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");
CREATE INDEX "AuditEvent_path_createdAt_idx" ON "AuditEvent"("path", "createdAt");
