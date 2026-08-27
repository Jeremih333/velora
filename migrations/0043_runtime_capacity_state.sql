CREATE TABLE runtime_capacity_state (
  state_key TEXT PRIMARY KEY CHECK (state_key = 'cloudflare-free'),
  status TEXT NOT NULL CHECK (status IN ('OK', 'WARNING', 'CRITICAL', 'EMERGENCY', 'EXCEEDED')),
  analytics_enabled INTEGER NOT NULL CHECK (analytics_enabled IN (0, 1)),
  cache_ttl_multiplier INTEGER NOT NULL CHECK (cache_ttl_multiplier BETWEEN 1 AND 12),
  background_jobs_enabled INTEGER NOT NULL CHECK (background_jobs_enabled IN (0, 1)),
  core_chat_enabled INTEGER NOT NULL CHECK (core_chat_enabled = 1),
  observed_at INTEGER NOT NULL
) STRICT;

INSERT INTO runtime_capacity_state
  (state_key, status, analytics_enabled, cache_ttl_multiplier,
   background_jobs_enabled, core_chat_enabled, observed_at)
VALUES ('cloudflare-free', 'OK', 1, 1, 1, 1, 0);
