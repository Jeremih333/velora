# Fixtures and synthetic staging data

## Staging quality seed

`toolkit/fixtures/staging-quality-seed.sql` contains only visibly synthetic `seed-*` resources:

- four test users and four personas, with no sessions or real Telegram identities;
- twelve published SAFE characters and normalized tags;
- two private lorebooks with six deterministic activation entries;
- one 240-message linear conversation, a persona snapshot and a memory version;
- three reports/cases covering open, in-review and resolved moderation states.

The SQL is idempotent and is exercised twice against the same temporary local D1 by
`toolkit/test-d1.mjs`. It is not a migration and must never enter production. The only supported
remote runner is allowlisted to database `velora-staging` and its exact database ID, requires the
22-migration healthy baseline plus the explicit confirmation, exports a backup first, then checks
counts, `quick_check` and foreign keys:

```powershell
node toolkit/seed-staging.mjs --apply --confirm=SEED_VELORA_STAGING
```

The runner deliberately creates no sessions, credit transactions, payments or AI requests.

## AI provider fixtures

Reusable typed fixtures live in `packages/ai/src/fixtures/` and are consumed directly by adapter
unit tests:

- `bothub-fragmented-success.json` — fragmented SSE, keepalive comment, usage and `[DONE]`;
- `bothub-missing-usage.json` — valid deltas but no billable usage, expected fail-closed result;
- `bothub-stream-error.json` — provider error event inside a successful HTTP stream.

They contain no provider secret, real prompt or generated private chat content.
