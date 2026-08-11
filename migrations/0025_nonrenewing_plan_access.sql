-- Immutable migration: configurable, non-renewing Free/Plus/Pro access purchased with Stars.
ALTER TABLE plans ADD COLUMN rank INTEGER NOT NULL DEFAULT 0 CHECK (rank BETWEEN 0 AND 1000);

UPDATE plans SET rank = 0, display_name = 'Free', updated_at = unixepoch() * 1000
WHERE code = 'FREE';

INSERT INTO plans (id, code, display_name, active, created_at, updated_at, rank)
VALUES
  ('plan-plus', 'PLUS', 'Plus', 1, unixepoch() * 1000, unixepoch() * 1000, 10),
  ('plan-pro', 'PRO', 'Pro', 1, unixepoch() * 1000, unixepoch() * 1000, 20);

INSERT INTO plan_entitlements (plan_id, entitlement, value_json)
VALUES
  ('plan-free', 'rate_limit_multiplier', '1'),
  ('plan-free', 'character_limit', '10'),
  ('plan-free', 'persona_limit', '3'),
  ('plan-free', 'memory_token_budget', '2000'),
  ('plan-free', 'lore_token_budget', '1000'),
  ('plan-free', 'advanced_operations_daily', '3'),
  ('plan-free', 'model_profiles', '["BALANCED"]'),
  ('plan-plus', 'rate_limit_multiplier', '2'),
  ('plan-plus', 'character_limit', '50'),
  ('plan-plus', 'persona_limit', '10'),
  ('plan-plus', 'memory_token_budget', '5000'),
  ('plan-plus', 'lore_token_budget', '4000'),
  ('plan-plus', 'advanced_operations_daily', '12'),
  ('plan-plus', 'model_profiles', '["BALANCED","CREATIVE"]'),
  ('plan-pro', 'rate_limit_multiplier', '4'),
  ('plan-pro', 'character_limit', '200'),
  ('plan-pro', 'persona_limit', '30'),
  ('plan-pro', 'memory_token_budget', '10000'),
  ('plan-pro', 'lore_token_budget', '8000'),
  ('plan-pro', 'advanced_operations_daily', '40'),
  ('plan-pro', 'model_profiles', '["BALANCED","CREATIVE","PREMIUM"]');

CREATE TABLE access_packs (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 255),
  stars_amount INTEGER NOT NULL CHECK (stars_amount > 0),
  plan_code TEXT NOT NULL REFERENCES plans(code),
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 366),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_access_packs_active
ON access_packs(active, sort_order, stars_amount);

CREATE TABLE plan_access_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > starts_at),
  source_payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id),
  revoked_at INTEGER,
  refunded_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_plan_access_active
ON plan_access_grants(user_id, starts_at, expires_at, revoked_at, refunded_at);

CREATE TABLE plan_operation_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 200),
  usage_date TEXT NOT NULL CHECK (length(usage_date) = 10),
  operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, operation_key)
) WITHOUT ROWID;

CREATE INDEX idx_plan_operation_usage_daily
ON plan_operation_usage(user_id, usage_date, operation);

ALTER TABLE payments ADD COLUMN access_pack_code TEXT REFERENCES access_packs(code);
ALTER TABLE payments ADD COLUMN plan_code TEXT REFERENCES plans(code);
ALTER TABLE payments ADD COLUMN access_duration_days INTEGER CHECK (access_duration_days BETWEEN 1 AND 366);
