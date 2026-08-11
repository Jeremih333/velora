-- One immutable, owner-confirmed provider checkpoint per explicitly versioned run key.
-- Prompt and generated text are never persisted; only bounded accounting evidence is retained.
CREATE TABLE provider_smoke_runs (
  run_key TEXT PRIMARY KEY CHECK (length(run_key) BETWEEN 1 AND 80),
  actor_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL CHECK (provider = 'BOTHUB'),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 128),
  state TEXT NOT NULL CHECK (state IN ('RUNNING', 'COMPLETED', 'FAILED')),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  provider_reported_cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (provider_reported_cost_micros >= 0),
  conservative_cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (conservative_cost_micros >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  output_sha256 TEXT CHECK (output_sha256 IS NULL OR length(output_sha256) = 64),
  output_length INTEGER NOT NULL DEFAULT 0 CHECK (output_length >= 0),
  error_code TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
) WITHOUT ROWID;
