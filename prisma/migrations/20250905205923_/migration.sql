-- CreateTable
CREATE TABLE "TradingStrategy" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyType" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingStrategy_typeId_idx" ON "TradingStrategy"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyType_name_key" ON "StrategyType"("name");

-- AddForeignKey
ALTER TABLE "TradingStrategy" ADD CONSTRAINT "TradingStrategy_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "StrategyType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
