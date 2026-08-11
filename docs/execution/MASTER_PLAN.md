# Master plan

0. Foundations: research, knowledge base, toolkit, monorepo, CI, Worker, D1 local/staging/prod.
1. Telegram auth, accounts, shell, themes and settings.
2. Personas and versioned characters with Telegram media adapter, discovery and preview.
3. Basic AI chat: persistence, streaming, provider abstraction, Markdown, branches/actions.
4. Advanced roleplay: templates, instructions, examples and generation profiles.
5. Persistent versioned memory with incremental/full rebuild and invalidation.
6. Lorebooks, deterministic activation, budgets and creator inspector.
7. Moderation, reports, appeals and append-only audit.
8. One-time Stars credits/access, idempotent ledger and reconciliation.
9. Reliability: bounded jobs, rate/cost controls, admin, observability, backup/restore.
10. Production hardening: load/security/accessibility/device E2E, staging and rollback.

Each milestone follows spec → tasks → implementation → focused tests → full gate → status/docs.
Production is forbidden before all global acceptance criteria are evidenced.
