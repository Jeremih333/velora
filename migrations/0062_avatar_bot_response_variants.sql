CREATE TABLE character_bot_response_variants (
  avatar_bot_id TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  source_update_id INTEGER NOT NULL,
  variant_index INTEGER NOT NULL CHECK (variant_index >= 0),
  telegram_message_id INTEGER NOT NULL,
  target_actor_telegram_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('GENERATING', 'COMPLETED', 'FAILED')),
  body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 12000),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (avatar_bot_id, telegram_chat_id, source_update_id, variant_index),
  FOREIGN KEY (avatar_bot_id) REFERENCES character_avatar_bots(id) ON DELETE CASCADE
);

CREATE INDEX idx_character_bot_response_variants_message
  ON character_bot_response_variants (avatar_bot_id, telegram_chat_id, telegram_message_id);
