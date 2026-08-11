# Data model

Core aggregates: account/session, plan/entitlement/access grant, persona, character/version,
conversation/message branch, memory/version, lorebook/entry, AI request, credit ledger/payment,
report/case/appeal and file.

Rules:

- UUID/ULID-like text identifiers are generated server-side.
- Telegram IDs are stored as decimal text to avoid JavaScript precision hazards.
- All timestamps are UTC integer milliseconds.
- Foreign keys and explicit indexes are mandatory; list endpoints use cursor pagination.
- Content uses soft deletion when recovery/audit is required. Privacy erasure is a separate,
  idempotent workflow that removes/anonymises dependent records.
- Large binary objects never enter D1.
- One-like, one-bookmark, one-review and external payment identities are protected by unique
  constraints. Reviews enforce a D1 rating range of 1–5 and a 1,000-character text ceiling.
- `api_rate_limits` stores only hashed subjects in expiring fixed windows. `product_events`
  stores a strict event allowlist and optional unique source key, never chat/prompt content.
- `feature_flags` is the D1 source of truth for validated rollout percentage and owner changes.
- `onboarding_completions` stores one idempotent, policy-timestamped first-run completion per user;
  it contains no Telegram initData or private chat content and is erased with the account.
- `plans` and typed `plan_entitlements` define server-side limits. `access_packs` are owner-configured
  one-time Stars offers; `plan_access_grants` link paid periods to immutable payment identities and
  support revocation/refund without mutable premium flags.
- `plan_operation_usage` reserves idempotent per-day advanced operations. Its unique
  `(user_id, operation_key)` key prevents retries from consuming the allowance twice.

Authoritative schema begins at `migrations/0001_initial.sql`; Drizzle declarations mirror it.
