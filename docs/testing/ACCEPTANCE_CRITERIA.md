# Acceptance criteria

## Evidence levels

- `NOT_IMPLEMENTED`: required behavior is absent.
- `IMPLEMENTED`: code exists, but functional or visual proof is incomplete.
- `FUNCTIONALLY_VERIFIED`: behavior, failure paths and persistence have passing evidence.
- `VISUALLY_VERIFIED`: the production-like build passed the required viewport, visual and a11y
  review without unexplained regressions.
- `PRODUCTION_VERIFIED`: the exact live production version passed the production evidence required
  by the acceptance criterion.

`DONE` requires all of `FUNCTIONALLY_VERIFIED`, `VISUALLY_VERIFIED` and `RELEASE_GATES_PASS`.
Requirements that explicitly concern live delivery also require `PRODUCTION_VERIFIED`.

A feature is `VERIFIED` only when UI, backend, migration, validation, permissions, error/loading
states, mobile behavior, tests and docs all exist and pass. Global production readiness additionally
requires lint, strict typecheck, unit, integration, contract, E2E, build, security, migration,
staging smoke, Telegram device checks, payment idempotency, backup restore and AI fallback.

Open Sev-1/Sev-2, a missing secret/payment human checkpoint or untested restore means
`BLOCKED_HUMAN`/`IN_PROGRESS`, never “done”. `docs/FINAL_VERIFICATION.md` tracks evidence per area.
