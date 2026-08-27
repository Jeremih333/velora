ALTER TABLE character_bot_ai_requests ADD COLUMN actor_telegram_id TEXT;

CREATE INDEX idx_character_bot_ai_actor_daily
ON character_bot_ai_requests(actor_telegram_id, created_at DESC, status);
