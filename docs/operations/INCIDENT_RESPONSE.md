# Incident response

- AI down: stop retry after bounded transient fallback, preserve user message, show Retry.
- D1 limit/outage: read-only/degraded landing and explicit retry-after; no hidden data loss.
- Telegram webhook: idempotent update inbox, monitor oldest pending update and retry.
- Payment mismatch: freeze grant, reconcile unique charge with ledger, never grant twice.
- Cost spike: emergency AI kill switch, deny new generations, preserve chats.
- Abuse: scoped rate controls and moderation queue; do not log private bodies globally.
- Suspected secret: disable/rotate immediately and audit history/access logs.

## Severity and release effect

### Sev-1 — release blocked

- authentication bypass;
- secret exposure;
- duplicated payment;
- data loss;
- arbitrary account access.

### Sev-2 — release blocked

- chat is broken;
- memory is corrupted or loses manual content;
- Lorebook activates incorrectly;
- `{{user}}` resolves to the wrong identity;
- Telegram Back is broken;
- the composer is inaccessible;
- a paid AI generation can be duplicated.

### Sev-3 — fix before a normal release

- significant visual regression;
- broken responsive screen;
- important text clipping.

A Sev-3 may ship only after the owner explicitly accepts a documented intentional divergence.
Sev-1/2 blocks every release until containment, root-cause analysis and passing regression evidence
exist. Reproduction difficulty never lowers severity.
