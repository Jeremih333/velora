-- Immutable migration: make child-bot model selection persistent and cost reservation fail-closed.
ALTER TABLE character_avatar_bots
ADD COLUMN model_profile_id TEXT NOT NULL DEFAULT 'velora-balanced';

ALTER TABLE character_bot_ai_requests
ADD COLUMN estimated_cost_micros INTEGER NOT NULL DEFAULT 0
CHECK (estimated_cost_micros >= 0);

CREATE INDEX idx_character_bot_ai_global_budget
ON character_bot_ai_requests(created_at, status, cost_micros, estimated_cost_micros);
