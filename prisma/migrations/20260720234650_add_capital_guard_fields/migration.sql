-- AlterTable
ALTER TABLE "RiskConfig" ADD COLUMN     "consecutiveLossLimit" INTEGER,
ADD COLUMN     "guardBufferPct" DOUBLE PRECISION NOT NULL DEFAULT 4,
ADD COLUMN     "guardConfirmTicks" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "guardCooldownMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "includeUnrealizedInDailyLoss" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxCrossBotExposurePct" DOUBLE PRECISION;
