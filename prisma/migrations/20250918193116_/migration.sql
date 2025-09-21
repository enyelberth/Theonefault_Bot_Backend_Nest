/*
  Warnings:

  - The primary key for the `TradingStrategy` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[id]` on the table `TradingStrategy` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "TradingStrategy" DROP CONSTRAINT "TradingStrategy_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT;
DROP SEQUENCE "TradingStrategy_id_seq";

-- CreateIndex
CREATE UNIQUE INDEX "TradingStrategy_id_key" ON "TradingStrategy"("id");
