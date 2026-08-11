PRAGMA defer_foreign_keys = ON;

CREATE TABLE file_objects_v2 (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('TELEGRAM', 'R2')),
  provider_file_id TEXT NOT NULL,
  provider_unique_id TEXT,
  object_key TEXT,
  mime_type TEXT NOT NULL,
  original_name TEXT,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER,
  height INTEGER,
  moderation_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (moderation_state IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(owner_id, storage_provider, provider_file_id)
) STRICT;

INSERT INTO file_objects_v2 (
  id, owner_id, storage_provider, provider_file_id, provider_unique_id, object_key,
  mime_type, original_name, byte_size, width, height, moderation_state, created_at, deleted_at
)
SELECT
  id, owner_id, storage_provider, provider_file_id, provider_unique_id, object_key,
  mime_type, original_name, byte_size, width, height, moderation_state, created_at, deleted_at
FROM file_objects;

DROP TABLE file_objects;
ALTER TABLE file_objects_v2 RENAME TO file_objects;
CREATE INDEX idx_file_objects_owner ON file_objects(owner_id, deleted_at);
CREATE INDEX idx_file_objects_unique ON file_objects(storage_provider, provider_unique_id);
