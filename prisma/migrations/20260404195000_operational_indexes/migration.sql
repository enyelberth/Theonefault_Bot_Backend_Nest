CREATE INDEX IF NOT EXISTS idx_trading_order_account_status_symbol_created
ON "TradingOrder" ("accountId", "status", "symbol", "createdAt");

CREATE INDEX IF NOT EXISTS idx_trading_order_account_closed_time
ON "TradingOrder" ("accountId", "closed_time");

CREATE INDEX IF NOT EXISTS idx_journal_entry_line_account_currency_entry
ON "JournalEntryLine" ("accountId", "currencyCode", "entryId");

CREATE INDEX IF NOT EXISTS idx_transfer_status_date_currency
ON "Transfer" ("statusId", "transferDate", "currencyCode");

CREATE INDEX IF NOT EXISTS idx_account_balance_account_currency
ON "AccountBalance" ("accountId", "currencyCode");

CREATE INDEX IF NOT EXISTS idx_notification_user_created
ON "Notification" ("userId", "createdAt");
