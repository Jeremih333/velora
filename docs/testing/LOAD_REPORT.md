# Local load-smoke report

Updated: 2026-08-09.

This is a bounded local capacity regression, not a production benchmark or SLO. It runs against a
fresh Wrangler Worker and D1 database with a local deterministic BotHub-compatible SSE fixture. It
never sends synthetic load to staging or production.

## Covered concurrency

| Path                           | Concurrency | p50    | p95    | max    |
| ------------------------------ | ----------: | ------ | ------ | ------ |
| Authenticated `/me`            |          40 | 257 ms | 470 ms | 475 ms |
| D1-backed `/ready`             |          40 | 410 ms | 410 ms | 410 ms |
| Discovery search               |          40 | 720 ms | 720 ms | 721 ms |
| Independent roleplay SSE chats |           4 | 495 ms | 498 ms | 498 ms |

The values above are the latest representative run on the owner workstation and may vary. The
regression uses loose ceilings of 5 seconds for authenticated/D1 traffic, 7.5 seconds for search
and 10 seconds for the local AI fixture.

## Findings

- Four independent AI streams complete concurrently with separate conversation locks, one final
  response per chat and one ledger deduction per completed request.
- A trial with more streams reached the configured global AI budget and failed closed with
  `AI_BUDGET_EXHAUSTED`; it did not expose a D1 race or bypass the ledger. The budget is the first
  intentional capacity boundary and must not be raised automatically.
- Forty concurrent D1 readiness queries and four authenticated identities completed without 5xx.
- Forty concurrent search queries completed below the regression ceiling. Search remains the
  slowest measured non-AI path and is the first query group to profile if catalogue size grows.
- The chat UI renders the latest 80 messages initially and exposes older history in batches of 80;
  a 1,000-message unit fixture and 100-message three-device E2E prevent unbounded DOM rendering.

Re-run with `pnpm test:integration`; the load phase is part of the real Worker+D1 integration
harness so it cannot silently drift away from current routes, budgets or schema.
