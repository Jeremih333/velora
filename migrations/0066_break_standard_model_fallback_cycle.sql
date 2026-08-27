-- DeepSeek V3 is itself the first fallback for the balanced profile. Pointing
-- it back to balanced created a cycle that blocked otherwise harmless owner
-- edits. End the chain at the stable economical context model instead.
UPDATE roleplay_model_overrides
SET fallback_ids_json = '["velora-free-context"]',
    updated_at = unixepoch() * 1000
WHERE model_profile_id = 'velora-deepseek-v3-0324';
