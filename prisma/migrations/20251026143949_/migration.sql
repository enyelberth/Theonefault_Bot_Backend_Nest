-- CreateEnum
CREATE TYPE "UpDown" AS ENUM ('up', 'down');

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "up_down" "UpDown" NOT NULL,
    "volume" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_symbol_timestamp_idx" ON "Alert"("symbol", "timestamp");
