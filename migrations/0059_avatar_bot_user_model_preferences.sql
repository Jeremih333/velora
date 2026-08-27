-- Model selection is private to one Telegram user interacting with one avatar bot.
CREATE TABLE character_bot_user_model_preferences (
  avatar_bot_id TEXT NOT NULL REFERENCES character_avatar_bots(id) ON DELETE CASCADE,
  telegram_user_id TEXT NOT NULL,
  model_profile_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (avatar_bot_id, telegram_user_id)
);

CREATE INDEX idx_character_bot_user_model_preferences_user
  ON character_bot_user_model_preferences(telegram_user_id, updated_at DESC);

-- Remove the legacy shared selection. Every user starts from the Free roleplay route
-- and may create an isolated preference only after a fresh server-side Pro check.
UPDATE character_avatar_bots
SET model_profile_id = 'velora-free-roleplay',
    updated_at = unixepoch() * 1000;
