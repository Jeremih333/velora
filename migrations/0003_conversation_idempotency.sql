-- Immutable migration: idempotency keys for conversation and message mutations.
CREATE TABLE mutation_idempotency_keys (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE_CONVERSATION', 'CREATE_MESSAGE', 'EDIT_MESSAGE', 'EDIT_MEMORY', 'RESTORE_MEMORY')),
  idempotency_key TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, operation, idempotency_key)
) WITHOUT ROWID;

CREATE INDEX idx_mutation_keys_created ON mutation_idempotency_keys(created_at);
