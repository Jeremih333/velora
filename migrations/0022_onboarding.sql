-- Immutable migration: idempotent, privacy-bounded first-run completion state.
CREATE TABLE onboarding_completions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  persona_id TEXT REFERENCES personas(id) ON DELETE SET NULL,
  mature_enabled INTEGER NOT NULL CHECK (mature_enabled IN (0, 1)),
  policy_accepted_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_onboarding_completions_completed
  ON onboarding_completions(completed_at);
