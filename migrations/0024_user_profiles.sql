-- Immutable migration: user-controlled product profiles are separate from Telegram identity.
CREATE TABLE user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 1000),
  avatar_file_id TEXT REFERENCES file_objects(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_user_profiles_visibility_updated
  ON user_profiles(visibility, updated_at DESC);

INSERT INTO user_profiles (user_id, display_name, created_at, updated_at)
SELECT id, substr(display_name, 1, 80), created_at, updated_at
FROM users WHERE deleted_at IS NULL;
