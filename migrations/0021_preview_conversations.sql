-- Creator test chats are private conversations over a versioned draft snapshot.
-- They must not inflate public creator engagement statistics.
ALTER TABLE conversations
  ADD COLUMN is_preview INTEGER NOT NULL DEFAULT 0 CHECK (is_preview IN (0, 1));

CREATE INDEX idx_conversations_user_preview_state
  ON conversations(user_id, is_preview, state, updated_at DESC)
  WHERE deleted_at IS NULL;
