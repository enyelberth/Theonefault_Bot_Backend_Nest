-- AlterTable
ALTER TABLE "BotRunnerTrade" ADD COLUMN     "closedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "realizedPnlToDate" DECIMAL(65,30) NOT NULL DEFAULT 0;
