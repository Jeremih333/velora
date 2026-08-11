# Test plan

Unit: templates, prompt budgeting, lore matching, credit ledger, auth crypto, Markdown policy,
memory state and model cost. Integration: D1 migrations/repositories/routes, Telegram fixtures,
AI mock streaming, payment idempotency. Contract: OpenAPI, Bot API updates and provider SSE. E2E:
mobile/desktop critical flows. Security: replay, forged identity, IDOR, injection, XSS, uploads,
rate/budget exhaustion. Automated load smoke targets a fresh local Worker/D1 only; staging gets
single-request smoke checks and production never receives synthetic load.
