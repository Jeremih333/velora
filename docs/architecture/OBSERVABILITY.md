# Observability

Structured request logs: request ID, route template, method, status, latency, environment and
internal hashed user ID. AI metrics: provider/model, TTFT, total latency, input/output/cached
tokens, estimated/actual cost, finish reason and failure class. No prompt/message body is logged.

Allowlisted product events contain only event name, route group, internal user reference and UTC
time. Generation, memory and payment completion use unique source keys so retries do not inflate
metrics. Analytics write failure is a warning and never breaks the user operation. The admin
dashboard exposes only aggregates for users/activity/messages/AI/cost/payment errors/moderation,
jobs and events; it contains no reader identities or content.

Alerts/budgets: Worker/D1 limit approach, AI balance runway, generation error rate, Telegram
webhook backlog, payment inconsistencies and failed erasure jobs. `/health` is liveness;
`/ready` checks D1 with a constant indexed query and never emits secrets.

The five-minute Worker schedule evaluates privacy-safe operational signals. It opens one D1 alert
per stable key, atomically leases outbound delivery and rate-limits repeat Telegram warnings to
six hours (critical alerts to one hour). AI error-rate alerts require at least 20 requests in a
15-minute window; budget alerts open at 80% and become critical at 95%. The owner/admin API can
inspect the last 100 alerts at `/api/v1/admin/operations/alerts`. Alert delivery is intentionally
inactive until the new Velora owner Telegram ID is explicitly verified and configured; alert
records are still retained while that setting is absent. These safety thresholds are not an SLO:
availability/latency objectives will be fixed only after a measured production baseline.
