CREATE TABLE IF NOT EXISTS strategy_event_log (
  id BIGSERIAL PRIMARY KEY,
  strategy_id TEXT,
  symbol TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_event_log_strategy_time
ON strategy_event_log (strategy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_event_log_symbol_time
ON strategy_event_log (symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_strategy_event_log_type_time
ON strategy_event_log (event_type, created_at DESC);
