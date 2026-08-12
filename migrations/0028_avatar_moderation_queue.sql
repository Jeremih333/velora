-- Immutable migration: at most one active system-created review per uploaded avatar.
-- User reports remain independent and may coexist with this upload-safety review.
CREATE UNIQUE INDEX idx_moderation_cases_active_system_avatar
ON moderation_cases(target_id)
WHERE target_type = 'AVATAR'
  AND report_id IS NULL
  AND state IN ('OPEN', 'TRIAGED', 'IN_REVIEW');
