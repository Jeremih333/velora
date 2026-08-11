-- Immutable migration: configurable one-time Telegram Stars prepaid credit packs.
CREATE TABLE credit_packs (
  code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  stars_amount INTEGER NOT NULL CHECK (stars_amount > 0),
  credit_amount_micros INTEGER NOT NULL CHECK (credit_amount_micros > 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

ALTER TABLE payments ADD COLUMN pack_code TEXT REFERENCES credit_packs(code);
ALTER TABLE payments ADD COLUMN credit_amount_micros INTEGER CHECK (credit_amount_micros > 0);
ALTER TABLE payments ADD COLUMN terms_accepted_at INTEGER;
ALTER TABLE payments ADD COLUMN client_idempotency_key TEXT;
ALTER TABLE payments ADD COLUMN invoice_url TEXT;

CREATE UNIQUE INDEX idx_payments_user_client_key
ON payments(user_id, client_idempotency_key)
WHERE client_idempotency_key IS NOT NULL;

CREATE INDEX idx_credit_packs_active
ON credit_packs(active, sort_order, stars_amount);
