-- Explicit server-owned discovery safety and rendering preferences.
-- Existing users who already enabled Mature content keep that catalogue choice.
ALTER TABLE user_settings ADD COLUMN safe_search INTEGER NOT NULL DEFAULT 1
  CHECK (safe_search IN (0, 1));

ALTER TABLE user_settings ADD COLUMN mature_image_blur INTEGER NOT NULL DEFAULT 1
  CHECK (mature_image_blur IN (0, 1));

UPDATE user_settings
SET safe_search = CASE WHEN nsfw_visible = 1 THEN 0 ELSE 1 END;

-- Provider completion classification is operational metadata, never generated roleplay text.
ALTER TABLE ai_requests ADD COLUMN finish_reason TEXT
  CHECK (finish_reason IS NULL OR length(finish_reason) BETWEEN 1 AND 80);
