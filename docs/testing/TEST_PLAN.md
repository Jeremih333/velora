# Test plan

Unit: templates, prompt budgeting, lore matching, credit ledger, auth crypto, Markdown policy,
memory state and model cost. Integration: D1 migrations/repositories/routes, Telegram fixtures,
AI mock streaming, payment idempotency. Contract: a dedicated CI command verifies the generated
OpenAPI 3.1 route/security/error/SSE surface, while the real Wrangler integration proves that
Cloudflare Assets does not replace `/openapi.json`; Bot API updates and provider SSE remain covered
by their protocol fixtures. E2E: mobile/desktop critical flows. Security: replay, forged identity,
IDOR, injection, XSS, uploads, rate/budget exhaustion. Automated load smoke targets a fresh local
Worker/D1 only; staging gets single-request smoke checks and production never receives synthetic
load.

The human-gated real payment procedure and its exact evidence requirements are defined in
[LIVE_STARS_CHECKPOINT.md](LIVE_STARS_CHECKPOINT.md). No mocked flow may be reported as that live
checkpoint.
