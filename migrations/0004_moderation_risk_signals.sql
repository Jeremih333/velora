-- Immutable migration: contextual moderation signals. Signals never apply sanctions directly.
CREATE TABLE risk_signals (
  id TEXT PRIMARY KEY,
  subject_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('REPORT', 'RATE_LIMIT', 'SYSTEM_RULE')),
  source_id TEXT,
  signal_type TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 100),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES users(id),
  dismissed_at INTEGER,
  UNIQUE(subject_user_id, source_type, source_id, signal_type)
) STRICT;

CREATE INDEX idx_risk_signals_subject
ON risk_signals(subject_user_id, dismissed_at, created_at DESC);
