CREATE TABLE IF NOT EXISTS opportunity_assessments (
 opportunity_id TEXT PRIMARY KEY REFERENCES opportunities(id),
 intent_fit TEXT NOT NULL DEFAULT 'unknown', evidence_quality TEXT NOT NULL DEFAULT 'unrated',
 placement TEXT NOT NULL DEFAULT 'research',target_site TEXT NOT NULL DEFAULT '',
 build_days REAL,monetization TEXT NOT NULL DEFAULT '',review_notes TEXT NOT NULL DEFAULT '',
 snapshot_json TEXT NOT NULL DEFAULT '{}',labels_json TEXT NOT NULL DEFAULT '[]',
 evaluated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assessments_placement ON opportunity_assessments(placement);
