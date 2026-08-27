CREATE TABLE message_generation_reactions (
  generation_id TEXT NOT NULL REFERENCES message_generations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('POSITIVE', 'NEGATIVE', 'EXCEPTIONAL')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(generation_id, user_id)
) STRICT;

CREATE INDEX idx_message_generation_reactions_user
  ON message_generation_reactions(user_id, updated_at DESC);
