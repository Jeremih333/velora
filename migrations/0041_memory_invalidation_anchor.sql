-- Remember the exact active-branch message that made the current summary stale.
ALTER TABLE conversations ADD COLUMN memory_stale_since_message_id TEXT;

CREATE INDEX idx_conversations_memory_stale
  ON conversations(user_id, memory_stale, memory_stale_since_message_id)
  WHERE deleted_at IS NULL;
