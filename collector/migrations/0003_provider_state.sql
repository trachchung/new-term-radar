CREATE TABLE IF NOT EXISTS collector_provider_state (
  provider TEXT PRIMARY KEY,
  last_attempted_at TEXT NOT NULL,
  blocked_until TEXT NOT NULL,
  last_error TEXT NOT NULL DEFAULT ''
);
