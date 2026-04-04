-- CreateEnum
CREATE TYPE "JournalPostingStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OPERATOR', 'TRADER', 'VIEWER');

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "postingStatus" "JournalPostingStatus" NOT NULL DEFAULT 'POSTED',
ADD COLUMN     "reversedEntryId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'TRADER';

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BinanceSyncLog" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "offsetAccountId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "syncHash" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "differencesJson" JSONB NOT NULL,
    "createdBy" TEXT,
    "journalEntryId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BinanceSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPnlSnapshot" (
    "id" SERIAL NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "accountId" INTEGER NOT NULL,
    "currencyCode" VARCHAR(20) NOT NULL,
    "realizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "income" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "expense" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "net" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPnlSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyKpi" (
    "id" SERIAL NOT NULL,
    "kpiDate" TIMESTAMP(3) NOT NULL,
    "winRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "profitFactor" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "maxDrawdown" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sharpe" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sortino" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "volatility" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyKpi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_name_key" ON "AccountingPeriod"("name");

-- CreateIndex
CREATE INDEX "AccountingPeriod_startsAt_endsAt_status_idx" ON "AccountingPeriod"("startsAt", "endsAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BinanceSyncLog_syncHash_key" ON "BinanceSyncLog"("syncHash");

-- CreateIndex
CREATE INDEX "BinanceSyncLog_accountId_createdAt_idx" ON "BinanceSyncLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "BinanceSyncLog_windowStart_windowEnd_idx" ON "BinanceSyncLog"("windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "DailyPnlSnapshot_snapshotDate_accountId_idx" ON "DailyPnlSnapshot"("snapshotDate", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPnlSnapshot_snapshotDate_accountId_currencyCode_key" ON "DailyPnlSnapshot"("snapshotDate", "accountId", "currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "DailyKpi_kpiDate_key" ON "DailyKpi"("kpiDate");

-- CreateIndex
CREATE INDEX "JournalEntry_entryDate_postingStatus_idx" ON "JournalEntry"("entryDate", "postingStatus");

-- CreateIndex
CREATE INDEX "JournalEntry_statusId_idx" ON "JournalEntry"("statusId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_entryId_idx" ON "JournalEntryLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalEntryLine_accountId_currencyCode_idx" ON "JournalEntryLine"("accountId", "currencyCode");

-- CreateIndex
CREATE INDEX "TradingExecution_tradeTimestamp_idx" ON "TradingExecution"("tradeTimestamp");

-- CreateIndex
CREATE INDEX "TradingOrder_closed_time_idx" ON "TradingOrder"("closed_time");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinanceSyncLog" ADD CONSTRAINT "BinanceSyncLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinanceSyncLog" ADD CONSTRAINT "BinanceSyncLog_offsetAccountId_fkey" FOREIGN KEY ("offsetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BinanceSyncLog" ADD CONSTRAINT "BinanceSyncLog_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPnlSnapshot" ADD CONSTRAINT "DailyPnlSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPnlSnapshot" ADD CONSTRAINT "DailyPnlSnapshot_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
