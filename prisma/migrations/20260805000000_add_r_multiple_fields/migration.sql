-- Add stopLossPrice, initialRisk, rMultiple to BotRunnerTrade for R-multiple tracking.
ALTER TABLE "BotRunnerTrade"
  ADD COLUMN "stopLossPrice" DECIMAL(65,30),
  ADD COLUMN "initialRisk" DECIMAL(65,30),
  ADD COLUMN "rMultiple" DECIMAL(65,30);
