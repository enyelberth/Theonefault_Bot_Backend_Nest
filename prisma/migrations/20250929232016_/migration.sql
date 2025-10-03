-- CreateTable
CREATE TABLE "CryptoPrice" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CryptoPrice_symbol_timestamp_idx" ON "CryptoPrice"("symbol", "timestamp");
