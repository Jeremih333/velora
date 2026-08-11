-- Additive owner-only grants. Administrative access must never be represented as a payment.
CREATE TABLE admin_user_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  plan_code TEXT REFERENCES plans(code),
  duration_days INTEGER CHECK (duration_days BETWEEN 1 AND 366),
  credit_amount_micros INTEGER NOT NULL DEFAULT 0
    CHECK (credit_amount_micros BETWEEN 0 AND 1000000000),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  created_at INTEGER NOT NULL,
  CHECK (
    (plan_code IS NULL AND duration_days IS NULL) OR
    (plan_code IS NOT NULL AND duration_days IS NOT NULL)
  ),
  CHECK (plan_code IS NOT NULL OR credit_amount_micros > 0)
) STRICT;

CREATE INDEX idx_admin_user_grants_target
ON admin_user_grants(user_id, created_at DESC);

CREATE TABLE admin_plan_access_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL REFERENCES plans(code),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > starts_at),
  source_grant_id TEXT NOT NULL UNIQUE REFERENCES admin_user_grants(id) ON DELETE CASCADE,
  revoked_at INTEGER,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_admin_plan_access_active
ON admin_plan_access_grants(user_id, starts_at, expires_at, revoked_at);
