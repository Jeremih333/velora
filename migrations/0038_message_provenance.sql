PRAGMA defer_foreign_keys = ON;

-- Preserve every child row before rebuilding messages. D1 enforces foreign keys while
-- migrations run, so dropping a populated parent directly would either cascade data or
-- fail the migration. These copies are removed again before the migration commits.
CREATE TABLE migration_0038_message_generations AS SELECT * FROM message_generations;
CREATE TABLE migration_0038_generation_locks AS SELECT * FROM generation_locks;
CREATE TABLE migration_0038_conversation_memory AS SELECT * FROM conversation_memory;
CREATE TABLE migration_0038_memory_versions AS SELECT * FROM memory_versions;

DROP TABLE generation_locks;
DROP TABLE message_generations;
DROP TABLE conversation_memory;
DROP TABLE memory_versions;

CREATE TABLE messages_v2 (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'INTERNAL')),
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'MARKDOWN' CHECK (content_format IN ('PLAIN_TEXT', 'MARKDOWN')),
  parent_message_id TEXT REFERENCES messages_v2(id),
  generation_group_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'STREAMING', 'COMPLETED', 'STOPPED', 'FAILED', 'DELETED', 'MODERATED')),
  is_greeting INTEGER NOT NULL DEFAULT 0 CHECK (is_greeting IN (0, 1)),
  edited_by_user INTEGER NOT NULL DEFAULT 0 CHECK (edited_by_user IN (0, 1)),
  origin TEXT NOT NULL DEFAULT 'LEGACY' CHECK (origin IN ('LEGACY', 'USER_INPUT', 'CHARACTER_GREETING', 'AI_GENERATION', 'USER_EDIT', 'INTERNAL')),
  model TEXT,
  provider TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  edited_at INTEGER,
  deleted_at INTEGER
) STRICT;

INSERT INTO messages_v2 (
  id, conversation_id, role, content, content_format, parent_message_id,
  generation_group_id, status, is_greeting, edited_by_user, origin, model, provider,
  metadata_json, created_at, updated_at, edited_at, deleted_at
)
SELECT
  id, conversation_id,
  CASE role WHEN 'SYSTEM_INTERNAL' THEN 'INTERNAL' ELSE role END,
  content, 'MARKDOWN', parent_message_id, generation_group_id,
  CASE WHEN deleted_at IS NOT NULL THEN 'DELETED' ELSE status END,
  0, CASE WHEN edited_at IS NULL THEN 0 ELSE 1 END, 'LEGACY', model, provider,
  metadata_json, created_at, COALESCE(edited_at, created_at), edited_at, deleted_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_v2 RENAME TO messages;

CREATE INDEX idx_messages_branch ON messages(conversation_id, parent_message_id, created_at);
CREATE INDEX idx_messages_generation ON messages(generation_group_id);

CREATE TABLE message_generations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  response_message_id TEXT REFERENCES messages(id),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'STREAMING', 'COMPLETED', 'STOPPED', 'FAILED')),
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_code TEXT,
  UNIQUE(conversation_id, idempotency_key)
) STRICT;
INSERT INTO message_generations SELECT * FROM migration_0038_message_generations;

CREATE TABLE generation_locks (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES message_generations(id) ON DELETE CASCADE,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
INSERT INTO generation_locks SELECT * FROM migration_0038_generation_locks;

CREATE TABLE conversation_memory (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  active_version_id TEXT,
  last_summarized_message_id TEXT REFERENCES messages(id),
  updated_at INTEGER NOT NULL
) STRICT;
INSERT INTO conversation_memory SELECT * FROM migration_0038_conversation_memory;

CREATE TABLE memory_versions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('AUTO_SUMMARY', 'FULL_REGENERATION', 'MANUAL_EDIT', 'RESTORE')),
  from_message_id TEXT REFERENCES messages(id),
  to_message_id TEXT REFERENCES messages(id),
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  model TEXT,
  previous_version_id TEXT REFERENCES memory_versions(id)
) STRICT;
INSERT INTO memory_versions SELECT * FROM migration_0038_memory_versions;
CREATE INDEX idx_memory_versions_conversation ON memory_versions(conversation_id, created_at DESC);

DROP TABLE migration_0038_generation_locks;
DROP TABLE migration_0038_message_generations;
DROP TABLE migration_0038_conversation_memory;
DROP TABLE migration_0038_memory_versions;
