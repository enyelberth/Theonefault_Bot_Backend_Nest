-- AlterTable
ALTER TABLE "BotRunnerTrade" ADD COLUMN     "mae" DECIMAL(65,30),
ADD COLUMN     "maePct" DECIMAL(65,30),
ADD COLUMN     "mfe" DECIMAL(65,30),
ADD COLUMN     "mfePct" DECIMAL(65,30),
ADD COLUMN     "peakPrice" DECIMAL(65,30),
ADD COLUMN     "troughPrice" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "TradeResult" ADD COLUMN     "mae" DECIMAL(65,30),
ADD COLUMN     "maePct" DECIMAL(65,30),
ADD COLUMN     "mfe" DECIMAL(65,30),
ADD COLUMN     "mfePct" DECIMAL(65,30);
