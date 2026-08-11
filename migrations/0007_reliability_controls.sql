CREATE TABLE api_rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(scope, subject_hash, window_started_at)
) WITHOUT ROWID;

CREATE INDEX idx_api_rate_limits_expiry ON api_rate_limits(expires_at);

CREATE TABLE product_events (
  id TEXT PRIMARY KEY,
  source_key TEXT UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'CHARACTER_OPEN',
    'CHAT_STARTED',
    'MESSAGE_SENT',
    'GENERATION_COMPLETED',
    'REGENERATED',
    'MEMORY_SUMMARIZED',
    'CHARACTER_CREATED',
    'CHARACTER_PUBLISHED',
    'PAYMENT_COMPLETED'
  )),
  route_group TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_product_events_time ON product_events(event_name, created_at DESC);
CREATE INDEX idx_product_events_user ON product_events(user_id, created_at DESC);

INSERT OR IGNORE INTO feature_flags
  (key, enabled, rollout_percent, config_json, updated_at, updated_by)
VALUES
  ('advanced_memory', 0, 0, '{}', 0, NULL),
  ('new_model', 0, 0, '{}', 0, NULL),
  ('public_reviews', 1, 100, '{}', 0, NULL),
  ('experimental_renderer', 0, 0, '{}', 0, NULL);
