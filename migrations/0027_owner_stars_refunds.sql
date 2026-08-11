-- Owner-initiated Telegram Stars refunds. One payment can be submitted at most once.
CREATE TABLE stars_refund_requests (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK (state IN ('CLAIMED', 'SUBMITTED', 'CONFIRMED', 'UNKNOWN')),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_stars_refund_requests_state
ON stars_refund_requests(state, updated_at DESC);
