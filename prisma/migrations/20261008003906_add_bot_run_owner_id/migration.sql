-- AlterTable
ALTER TABLE "BotRun" ADD COLUMN     "ownerId" INTEGER;

-- CreateIndex
CREATE INDEX "BotRun_ownerId_idx" ON "BotRun"("ownerId");
