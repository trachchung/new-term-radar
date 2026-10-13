CREATE TABLE IF NOT EXISTS opportunities (
 id TEXT PRIMARY KEY,
 keyword TEXT NOT NULL,
 normalized_key TEXT NOT NULL UNIQUE,
 stage TEXT NOT NULL DEFAULT 'hypothesis',
 rubric_score INTEGER NOT NULL DEFAULT 0,
 origin_count INTEGER NOT NULL DEFAULT 0,
 evidence_count INTEGER NOT NULL DEFAULT 0,
 intent_signature TEXT NOT NULL DEFAULT '',
 record_json TEXT NOT NULL,
 review_status TEXT NOT NULL DEFAULT 'inbox' CHECK(review_status IN ('inbox','watch','build','reject')),
 decision_note TEXT NOT NULL DEFAULT '',
 target_site TEXT NOT NULL DEFAULT '',
 imported_at TEXT NOT NULL DEFAULT (datetime('now')),
 decision_updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage_score ON opportunities(stage,rubric_score DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_review_status ON opportunities(review_status);
CREATE INDEX IF NOT EXISTS idx_opportunities_intent ON opportunities(intent_signature);
CREATE TABLE IF NOT EXISTS decision_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
 old_status TEXT NOT NULL, new_status TEXT NOT NULL,
 old_site TEXT NOT NULL DEFAULT '', new_site TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_decision_item ON decision_events(opportunity_id,created_at DESC);
