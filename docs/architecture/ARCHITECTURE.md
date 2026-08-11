# Architecture

## Free-plan topology

```text
Telegram → velora-app Worker (Hono + static assets)
                    ├─ D1 (source of truth)
                    ├─ Telegram Bot API (webhook + media file_id)
                    ├─ BotHub (one-time-funded roleplay streaming only)
                    └─ Workers AI free allocation (optional summaries/moderation)
```

Staging and production have separate Workers, D1 databases, secrets and bot configuration.
One Worker avoids network hops and fits the Workers Free limit. D1 CAS/idempotency rows provide
generation coordination; chat streaming remains an HTTP stream. Queues are reserved for bounded
asynchronous work and capped below their free daily allowance.

The scheduled integration reconciler uses a D1 lease and desired-state hash to configure the
Telegram webhook, commands, menu button and descriptions idempotently. It retries with a bounded
backoff and persists no Telegram token or webhook secret in D1.

The same leased state machine checks BotHub reachability through its authenticated model-list
endpoint every six hours. It never generates content during health checks and never stores the API
key or provider response in D1.

A separate owner-only paid checkpoint can execute exactly one short roleplay request per explicitly
presented version after confirmation in the Mini App. A versioned D1 run key is claimed before
network access; there are no retries or fallbacks, and only protocol/status classification,
token/cost accounting, latency and an output hash are persisted. Prompt, provider response body and
generated text are not stored by this diagnostic path. A failed version is immutable rather than
silently reset; any corrected protocol requires a distinct consented run key.

R2 is an optional `MediaStore` adapter. It is not enabled on the account, so the initial
production adapter stores Telegram `file_id` plus MIME/name metadata and refreshes temporary
download URLs through `getFile`. This avoids a card/billing checkpoint while keeping R2 swappable.

## Dependency rule

Routes validate and authorize, services own use cases, repositories own prepared D1 statements,
and provider adapters own external APIs. Domain packages never import Hono, Wrangler or React.
