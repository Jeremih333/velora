-- Immutable migration: private support requests with bounded states and ownership.
CREATE TABLE support_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('GENERAL', 'TECHNICAL', 'PAYMENT', 'SAFETY', 'DATA')),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 3 AND 120),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 20 AND 4000),
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')),
  resolution_note TEXT NOT NULL DEFAULT '' CHECK (length(resolution_note) <= 4000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER
) STRICT;

CREATE INDEX idx_support_requests_user_created
  ON support_requests(user_id, created_at DESC);

CREATE INDEX idx_support_requests_state_updated
  ON support_requests(state, updated_at DESC);
