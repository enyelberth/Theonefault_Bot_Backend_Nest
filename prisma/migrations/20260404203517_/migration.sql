-- DropIndex
DROP INDEX "idx_account_balance_account_currency";

-- DropIndex
DROP INDEX "idx_journal_entry_line_account_currency_entry";

-- DropIndex
DROP INDEX "idx_notification_user_created";

-- DropIndex
DROP INDEX "idx_trading_order_account_closed_time";

-- DropIndex
DROP INDEX "idx_trading_order_account_status_symbol_created";

-- DropIndex
DROP INDEX "idx_transfer_status_date_currency";

-- DropIndex
DROP INDEX "idx_strategy_event_log_strategy_time";

-- DropIndex
DROP INDEX "idx_strategy_event_log_symbol_time";

-- DropIndex
DROP INDEX "idx_strategy_event_log_type_time";

-- AlterTable
ALTER TABLE "strategy_event_log" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "idx_strategy_event_log_strategy_time" ON "strategy_event_log"("strategy_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_strategy_event_log_symbol_time" ON "strategy_event_log"("symbol", "created_at");

-- CreateIndex
CREATE INDEX "idx_strategy_event_log_type_time" ON "strategy_event_log"("event_type", "created_at");
