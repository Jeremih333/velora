-- Immutable migration: fail closed for replacement routes that appeared in the key-scoped
-- catalogue but returned a real provider 404 during the owner-confirmed staging smoke.
UPDATE conversation_settings
SET model_profile_id = 'velora-balanced'
WHERE model_profile_id IN ('velora-rocinante', 'velora-deepseek-r1');

UPDATE character_avatar_bots
SET model_profile_id = 'velora-balanced', updated_at = unixepoch() * 1000
WHERE model_profile_id IN ('velora-rocinante', 'velora-deepseek-r1');

UPDATE roleplay_model_default
SET model_profile_id = 'velora-balanced', updated_at = unixepoch() * 1000, updated_by = NULL
WHERE model_profile_id IN ('velora-rocinante', 'velora-deepseek-r1');

UPDATE roleplay_model_overrides
SET enabled = 0, updated_at = unixepoch() * 1000, updated_by = NULL
WHERE model_profile_id IN ('velora-rocinante', 'velora-deepseek-r1');
