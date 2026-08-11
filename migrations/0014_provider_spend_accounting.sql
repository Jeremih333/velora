-- Keep user-billable roleplay cost separate from the owner's conservative
-- provider spend. Retry, fallback, stop and failure attempts may consume
-- provider funds even when the user is not charged for a completed answer.
ALTER TABLE ai_requests
  ADD COLUMN provider_estimated_cost_micros INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_requests
  ADD COLUMN provider_actual_cost_micros INTEGER NOT NULL DEFAULT 0;

UPDATE ai_requests
SET provider_estimated_cost_micros = estimated_cost_micros,
    provider_actual_cost_micros = CASE
      WHEN status = 'COMPLETED' THEN COALESCE(actual_cost_micros, estimated_cost_micros)
      ELSE 0
    END;
