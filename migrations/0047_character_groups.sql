-- Immutable migration: user-owned multi-character groups and stable conversation snapshots.
CREATE TABLE character_groups (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  avatar_file_id TEXT REFERENCES file_objects(id) ON DELETE SET NULL,
  routing_mode TEXT NOT NULL DEFAULT 'CONTEXTUAL'
    CHECK (routing_mode IN ('CONTEXTUAL', 'MANUAL')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;

CREATE INDEX idx_character_groups_owner
ON character_groups(owner_id, deleted_at, updated_at DESC);

CREATE TABLE character_group_members (
  group_id TEXT NOT NULL REFERENCES character_groups(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 11),
  added_at INTEGER NOT NULL,
  PRIMARY KEY(group_id, character_id),
  UNIQUE(group_id, position)
) WITHOUT ROWID;

CREATE INDEX idx_character_group_members_character
ON character_group_members(character_id, group_id);

CREATE TABLE conversation_character_groups (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES character_groups(id),
  routing_mode TEXT NOT NULL CHECK (routing_mode IN ('CONTEXTUAL', 'MANUAL')),
  active_character_id TEXT NOT NULL REFERENCES characters(id),
  created_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE conversation_group_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id),
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 11),
  PRIMARY KEY(conversation_id, character_id),
  UNIQUE(conversation_id, position)
) WITHOUT ROWID;

CREATE INDEX idx_conversation_group_members_character
ON conversation_group_members(character_id, conversation_id);
