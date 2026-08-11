# Memory architecture

Each conversation has an active persistent memory document and immutable versions. Sources are
`AUTO_SUMMARY`, `FULL_REGENERATION`, `MANUAL_EDIT`, and `RESTORE`.

The Free-tier path never calls a paid AI provider and cannot invent facts. Up to 500 messages use
`deterministic-extractive-v1`. Longer active branches are traversed in bounded D1 pages and use
`deterministic-hierarchical-v1`: chronological 50-message episodes are compacted and merged without
cutting off the beginning of the branch. The verified hard safety ceiling is 10,000 branch records;
exceeding it fails explicitly while leaving the previous memory intact. `Summarize new` combines
the current memory with only messages after its coverage marker; full rebuild covers the complete
branch. Editing covered history marks memory stale and asks the user to regenerate or explicitly
keep it.

Context budget order: safety/system, essential character, persona, memory, relevant lore, recent
branch, output. Current/manual memory is preserved as input to the next incremental summary. All jobs and
version writes are idempotent. D1 jobs use conditional leases, five bounded attempts, exponential
backoff and `DEAD` state. HTTP `waitUntil` provides immediate best-effort processing while a
five-minute Cron Trigger recovers delayed and expired jobs.
