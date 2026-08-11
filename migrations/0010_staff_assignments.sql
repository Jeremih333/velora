-- Append-only staff appointment history. Current users.role remains the fast RBAC projection.
CREATE TABLE staff_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_role TEXT NOT NULL CHECK (assigned_role IN ('MODERATOR', 'SENIOR_MODERATOR')),
  previous_role TEXT NOT NULL CHECK (previous_role IN ('USER', 'CREATOR')),
  assigned_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at INTEGER NOT NULL,
  revoked_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at INTEGER,
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR
         (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX idx_staff_assignments_active
ON staff_assignments(user_id) WHERE revoked_at IS NULL;

CREATE INDEX idx_staff_assignments_history
ON staff_assignments(assigned_at DESC, revoked_at);
