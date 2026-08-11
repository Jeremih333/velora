-- Persist only reconciliation state and a one-way desired-configuration hash.
-- Bot tokens and webhook secrets remain Cloudflare Worker secrets.
CREATE TABLE integration_reconciliations (
  integration_key TEXT PRIMARY KEY,
  desired_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('APPLYING', 'READY', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at INTEGER NOT NULL,
  verified_at INTEGER,
  last_error_code TEXT,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX idx_integration_reconciliations_due
  ON integration_reconciliations(state, next_attempt_at);
