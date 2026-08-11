# Incident response

- AI down: stop retry after bounded transient fallback, preserve user message, show Retry.
- D1 limit/outage: read-only/degraded landing and explicit retry-after; no hidden data loss.
- Telegram webhook: idempotent update inbox, monitor oldest pending update and retry.
- Payment mismatch: freeze grant, reconcile unique charge with ledger, never grant twice.
- Cost spike: emergency AI kill switch, deny new generations, preserve chats.
- Abuse: scoped rate controls and moderation queue; do not log private bodies globally.
- Suspected secret: disable/rotate immediately and audit history/access logs.

Sev-1/2 blocks production changes until containment and regression evidence exist.
