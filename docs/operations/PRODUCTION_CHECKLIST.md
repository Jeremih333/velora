# Production checklist

## Before any mutation

- [ ] Explicit owner authorization names the exact phase.
- [ ] Secret scan, format, docs, lint, strict typecheck, unit, roleplay, contract, integration, build and E2E gates pass.
- [ ] Production-like visual and accessibility runs have been manually reviewed.
- [ ] Wrangler identity and target account/database are read-only verified.
- [ ] Migration is immutable, preview-tested and has a recovery plan.
- [ ] BotHub model candidates have current availability evidence and the required paid eval confirmation.
- [ ] Telegram Stars products, payload idempotency and entitlement duration are checked.

## Phase 1 — infrastructure

- [ ] Apply only approved D1 migrations.
- [ ] Deploy the single production Worker with known bindings and secrets.
- [ ] Run HTTP/session/read-only smoke checks.
- [ ] Do not change the Telegram webhook if any check fails.

## Phase 2 — Telegram cutover

- [ ] Obtain separate explicit authorization.
- [ ] Confirm the target bot username and webhook URL.
- [ ] Switch webhook once, verify Telegram response and run `/start` plus Mini App smoke.
- [ ] Stop and preserve the previous webhook details if Telegram does not confirm.

## After release

- [ ] Record deployment/version identifiers and production evidence.
- [ ] Verify error rate, latency, D1/Worker capacity and notification delivery.
- [ ] Update `FINAL_VERIFICATION_REPORT.md` honestly; do not convert missing real-payment or real-provider evidence into a pass.
