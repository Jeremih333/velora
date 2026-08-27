# Memory architecture

Each conversation has separate pinned/manual context and an automatic summary plus immutable
versions containing both blocks. Sources are
`AUTO_SUMMARY`, `FULL_REGENERATION`, `MANUAL_EDIT`, and `RESTORE`.

The Free-tier path never calls a paid AI provider and cannot invent facts. Up to 500 messages use
`deterministic-extractive-v1`. Longer active branches are traversed in bounded D1 pages and use
`deterministic-hierarchical-v1`: chronological 50-message episodes are compacted and merged without
cutting off the beginning of the branch. The verified hard safety ceiling is 10,000 branch records;
exceeding it fails explicitly while leaving the previous memory intact. `Summarize new` combines
the existing automatic summary with only messages after its coverage marker. Full rebuild covers
the complete branch and replaces only `auto_summary`. Neither path can write `manual_context`;
only the authenticated manual edit or restore path can change that block. Editing covered history
marks memory stale and asks the user to regenerate or explicitly keep it.
The exact invalidating message is retained in `memory_stale_since_message_id`. Full regeneration
is preceded by a read-only Current/Generated preview, and restoring an older version is also
confirmed from a preview; neither preview mutates D1. Automatic work is queued only at a bounded
threshold of 20 new messages or 12,000 new characters.

The product brief names DeepSeek V4 Flash as the preferred future summary model. It is not exposed
by the currently verified BotHub API catalogue, so production does not pretend to use it or spend
CAPS silently. The deterministic models above remain the no-cost, auditable fallback until a
provider model is separately validated and paid-memory generation is explicitly enabled.

Context budget order: safety/system, essential character, persona, labelled pinned context,
labelled automatic summary, relevant lore, conversation instructions, recent branch, output. All
jobs and version writes are idempotent. D1 jobs use conditional leases, five bounded attempts, exponential
backoff and `DEAD` state. HTTP `waitUntil` provides immediate best-effort processing while a
five-minute Cron Trigger recovers delayed and expired jobs.
