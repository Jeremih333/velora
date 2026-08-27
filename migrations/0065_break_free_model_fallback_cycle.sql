-- Keep the economical fallback graph acyclic. Migration 0064 may already be
-- present in preview/local databases, so this correction is intentionally a
-- new immutable migration instead of rewriting applied history.
UPDATE roleplay_model_overrides
SET fallback_ids_json = '[]',
    updated_at = unixepoch() * 1000
WHERE model_profile_id = 'velora-free-context';
