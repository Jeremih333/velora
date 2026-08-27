-- Immutable migration: persist the stable Velora model identifier separately from the
-- provider model name. Existing conversations retain the previously verified Balanced route.
ALTER TABLE conversation_settings ADD COLUMN model_profile_id TEXT NOT NULL DEFAULT 'velora-balanced';
CREATE INDEX idx_conversation_settings_model_profile_id
  ON conversation_settings(model_profile_id);

ALTER TABLE ai_requests ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'USER_CREDITS'
  CHECK (billing_mode IN ('USER_CREDITS', 'SPONSORED_FREE'));
CREATE INDEX idx_ai_requests_free_daily
  ON ai_requests(user_id, billing_mode, created_at, status);
