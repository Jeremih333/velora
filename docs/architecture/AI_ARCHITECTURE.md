# AI architecture

`AIProvider` exposes streaming, health and cost estimation. The chat service selects a model
profile and never imports a provider-specific SDK.

Initial routing:

- Economy/Balanced candidate selected from the authenticated capability intersection:
  `deepseek-chat-v3.1`.
- Creative and Premium routing remain gated until an available candidate passes the same
  owner-consented quality/accounting checkpoint; unavailable historical models are not contacted.
- Memory/moderation: Workers AI free allowance or deterministic degraded mode; prepaid roleplay
  funds are not silently consumed for auxiliary tasks.

Creator assistance is also isolated from paid roleplay generation. Avatar generation uses the
Workers AI `flux-1-schnell` binding and character-field assistance uses
`llama-3.1-8b-instruct-fast`. Both have per-user plan-aware daily limits plus a separate global
allowance guard. Generated avatar bytes are not written to D1 and enter the same validated private
media upload path as local files. Text assistance accepts only four allowlisted targets, treats all
author content as untrusted reference data, caps input/output, and returns a proposal without
mutating a draft. The web client requires an explicit “Apply” action, after which ordinary form
validation, token accounting, autosave and immutable character versioning remain authoritative.

Every request reserves the most expensive configured candidate against user credits and the sum
of every allowed retry/fallback attempt against the owner's provider budget before provider
contact. It has an idempotency key, records provider spend separately from the billable successful
answer and releases the generation lock. Failed and stopped generations do not charge the user,
but conservatively retain started provider attempts in the global budget. The primary model
gets one bounded retry with exponential backoff; then up to two explicitly priced fallbacks run
only for transient/rate/provider errors and only before the first output delta. Authentication,
validation, abort and partial-stream failures never switch models. Provider-reported usage above
the pre-authorized ceiling fails closed instead of creating user debt. BotHub receives no
auxiliary traffic. Its reported upstream cost is never allowed to lower the conservative retail
ceiling used by the internal ledger. The ceiling includes a separately configured fixed request
fee for every successful LLM request; the current `0.02 USD` value deliberately exceeds the
catalogue's `1 ₽` fee at the planning exchange rate. A live balance delta must still be reconciled
before enabling paid generation.

Prompt precedence: platform safety → platform generation instructions → immutable character version
→ creator instructions → Persona snapshot/live context → pinned manual context → automatic summary
→ relevant active Lorebook entries → conversation instructions → recent active branch → latest user
message. Optional post-history creator instructions remain an explicitly labelled final system block.

Documented variables are expanded by an application-owned, non-evaluating template renderer.
Escaped variables remain literal and unknown variables are reported instead of executed. Parsed
example dialogues may use user/assistant role labels, but together receive at most 20% of the
available context so they cannot displace recent history. Post-history instructions are inserted
after the recent branch and before generation, while platform policy remains immutable.

Lore activation is application-controlled, never delegated to the model. The Worker normalizes
recent context, applies primary/secondary keys, case and whole-word rules, then orders matches by
priority/position and enforces per-entry plus total token budgets before template expansion.
