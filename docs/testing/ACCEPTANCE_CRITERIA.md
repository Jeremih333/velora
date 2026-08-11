# Acceptance criteria

A feature is `VERIFIED` only when UI, backend, migration, validation, permissions, error/loading
states, mobile behavior, tests and docs all exist and pass. Global production readiness additionally
requires lint, strict typecheck, unit, integration, contract, E2E, build, security, migration,
staging smoke, Telegram device checks, payment idempotency, backup restore and AI fallback.

Open Sev-1/Sev-2, a missing secret/payment human checkpoint or untested restore means
`BLOCKED_HUMAN`/`IN_PROGRESS`, never “done”. `docs/FINAL_VERIFICATION.md` tracks evidence per area.
