CREATE TABLE IF NOT EXISTS collector_runs (
 id TEXT PRIMARY KEY,
 started_at TEXT NOT NULL,
 ended_at TEXT,
 status TEXT NOT NULL,
 total_topics INTEGER NOT NULL DEFAULT 0,
 total_matches INTEGER NOT NULL DEFAULT 0,
 errors_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_collector_runs_started ON collector_runs(started_at DESC);
