-- Split user-owned pinned context from the automatic branch summary without losing legacy data.
ALTER TABLE conversation_memory RENAME COLUMN active_version_id TO current_version_id;
ALTER TABLE conversation_memory ADD COLUMN manual_context TEXT NOT NULL DEFAULT '';
ALTER TABLE conversation_memory ADD COLUMN auto_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE memory_versions RENAME COLUMN source_type TO source;
ALTER TABLE memory_versions ADD COLUMN manual_context TEXT NOT NULL DEFAULT '';
ALTER TABLE memory_versions ADD COLUMN auto_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE memory_versions ADD COLUMN provider TEXT;

UPDATE memory_versions
SET manual_context = content,
    auto_summary = '';

-- Legacy `content` mixed user edits and automatic summaries, so its provenance cannot be
-- reconstructed reliably. Pinning the complete legacy value is the only lossless migration:
-- later automation may add a fresh auto summary but can never erase a user-maintained fact.

UPDATE conversation_memory
SET manual_context = COALESCE(
      (SELECT mv.manual_context FROM memory_versions mv WHERE mv.id = current_version_id),
      ''
    ),
    auto_summary = COALESCE(
      (SELECT mv.auto_summary FROM memory_versions mv WHERE mv.id = current_version_id),
      ''
    );
