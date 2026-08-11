-- Immutable migration: at most one active system-created review per character.
-- User reports remain independent and may coexist with this conservative age-safety review.
CREATE UNIQUE INDEX idx_moderation_cases_active_system_character
ON moderation_cases(target_id)
WHERE target_type = 'CHARACTER'
  AND report_id IS NULL
  AND state IN ('OPEN', 'TRIAGED', 'IN_REVIEW');
