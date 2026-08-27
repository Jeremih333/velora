ALTER TABLE generation_locks
ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX idx_generation_locks_user
ON generation_locks(user_id)
WHERE user_id IS NOT NULL;
