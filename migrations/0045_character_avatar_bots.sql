-- Immutable migration: encrypted Pro-only character bots for Telegram groups.
CREATE TABLE character_bot_setup_requests (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('AWAITING_TOKEN', 'CONFIGURING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_character_bot_setup_active
ON character_bot_setup_requests(owner_id)
WHERE state IN ('AWAITING_TOKEN', 'CONFIGURING');

CREATE TABLE character_avatar_bots (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  telegram_bot_id TEXT NOT NULL UNIQUE,
  telegram_username TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED', 'REVOKED', 'ERROR')),
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id, character_id)
) STRICT;

CREATE INDEX idx_character_avatar_bots_owner
ON character_avatar_bots(owner_id, status, updated_at DESC);

CREATE TABLE character_bot_group_memory (
  avatar_bot_id TEXT NOT NULL REFERENCES character_avatar_bots(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  summarized_through_update_id INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(avatar_bot_id, telegram_chat_id)
) WITHOUT ROWID;

CREATE TABLE character_bot_group_events (
  avatar_bot_id TEXT NOT NULL REFERENCES character_avatar_bots(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL,
  update_id INTEGER NOT NULL,
  actor_telegram_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(avatar_bot_id, telegram_chat_id, update_id)
) WITHOUT ROWID;

CREATE TABLE character_bot_ai_requests (
  id TEXT PRIMARY KEY,
  avatar_bot_id TEXT NOT NULL REFERENCES character_avatar_bots(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_chat_id TEXT NOT NULL,
  provider_model_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMPLETED', 'FAILED')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  created_at INTEGER NOT NULL,
  completed_at INTEGER
) STRICT;

CREATE INDEX idx_character_bot_ai_owner_daily
ON character_bot_ai_requests(owner_id, created_at DESC, status);
