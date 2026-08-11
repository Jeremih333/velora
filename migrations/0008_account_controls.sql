CREATE TABLE user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  CHECK (blocker_id != blocked_user_id),
  PRIMARY KEY(blocker_id, blocked_user_id)
) WITHOUT ROWID;

CREATE INDEX idx_user_blocks_blocked ON user_blocks(blocked_user_id, blocker_id);

CREATE TABLE account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'PROCESSING', 'CANCELLED', 'COMPLETED', 'FAILED')),
  requested_at INTEGER NOT NULL,
  execute_after INTEGER NOT NULL,
  cancelled_at INTEGER,
  completed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  lease_expires_at INTEGER,
  last_error_code TEXT,
  retention_json TEXT NOT NULL DEFAULT '{}'
) STRICT;

CREATE INDEX idx_account_deletion_due
  ON account_deletion_requests(state, execute_after, lease_expires_at);
