/*
  Warnings:

  - You are about to drop the column `orderId` on the `TradeResult` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "TradeResult" DROP CONSTRAINT "TradeResult_orderId_fkey";

-- AlterTable
ALTER TABLE "TradeResult" DROP COLUMN "orderId",
ADD COLUMN     "externalOrderId" TEXT;
