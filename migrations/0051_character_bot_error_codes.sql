ALTER TABLE character_bot_ai_requests ADD COLUMN error_code TEXT;

CREATE INDEX idx_character_bot_ai_recent_failures
ON character_bot_ai_requests(status, created_at DESC, error_code)
WHERE status = 'FAILED';
