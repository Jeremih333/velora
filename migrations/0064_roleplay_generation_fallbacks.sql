-- Keep roleplay generation available during a transient BotHub model outage.
-- Fallbacks never elevate access: standard falls back to standard/free,
-- while the free profile only falls back to another free profile.
UPDATE roleplay_model_overrides
SET fallback_ids_json = '["velora-deepseek-v3-0324","velora-free-context"]',
    updated_at = unixepoch() * 1000
WHERE model_profile_id = 'velora-balanced';

UPDATE roleplay_model_overrides
SET fallback_ids_json = '["velora-free-context"]',
    updated_at = unixepoch() * 1000
WHERE model_profile_id = 'velora-free-roleplay';
