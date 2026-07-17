-- CreateEnum
CREATE TYPE "PaperOrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELED');

-- CreateTable
CREATE TABLE "PaperOrder" (
    "id" SERIAL NOT NULL,
    "botRunId" INTEGER,
    "externalId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "type" TEXT NOT NULL,
    "price" DECIMAL(65,30),
    "stopPrice" DECIMAL(65,30),
    "quantity" DECIMAL(65,30) NOT NULL,
    "status" "PaperOrderStatus" NOT NULL DEFAULT 'OPEN',
    "filledPrice" DECIMAL(65,30),
    "filledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaperOrder_externalId_key" ON "PaperOrder"("externalId");

-- CreateIndex
CREATE INDEX "PaperOrder_symbol_status_idx" ON "PaperOrder"("symbol", "status");

-- CreateIndex
CREATE INDEX "PaperOrder_botRunId_idx" ON "PaperOrder"("botRunId");
