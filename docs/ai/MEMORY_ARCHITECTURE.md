# Memory architecture

Conversation memory is a first-class, user-visible D1 object, not a hidden provider summary or
React-only state. `conversation_memory` stores independent `manual_context` and `auto_summary`
blocks, the last covered message, and the current immutable version. A bounded summarization job
changes the pointer only after a valid version containing both blocks is stored.

## Invariants

- Memory is scoped to the conversation and authorized participant.
- Summarization is idempotent for the same cursor/version input.
- The original message history remains authoritative and is not silently rewritten.
- The user can add, remove or rewrite pinned manual context; automation never changes it.
- Incremental summarization combines the previous automatic summary only with messages after
  `last_summarized_message_id`.
- Full regeneration rebuilds only the automatic summary, including hierarchical long-history
  compaction, while retaining manual context byte-for-byte.
- Before full regeneration the API returns a read-only current/generated comparison. Applying it
  still creates a background job and a new immutable version; cancelling performs no write.
- The fallback summary carries an explicit retention contract for key events, relationships,
  promises, conflicts, feelings, facts, characters, locations, goals, open plot lines, important
  objects and character changes. It explicitly rejects phrase-by-phrase retention and invention.
- Automatic jobs are queued only after 20 unsummarized messages or 12,000 unsummarized characters,
  never after every response.
- Prompt assembly receives explicitly labelled manual and automatic blocks within its token budget.
- Failure leaves the previous active version intact.
- Each version records both blocks, source, covered message range, provider/model metadata and its
  predecessor; restore creates another immutable version.
- An edit, deletion or branch switch records `memory_stale_since_message_id`; rebuilding or an
  explicit keep action clears both the stale flag and its anchor.
- Migration from the legacy combined `content` field pins that value as manual context because
  its user-written and generated fragments cannot be separated without risking silent data loss.
- Inspectors expose version, cursor and token metadata only to the authorized participant.

Unit roleplay scenarios, Worker/D1 integration and the long-history browser journey are the required evidence layers.
