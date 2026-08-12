# Decision log

## 2026-08-09 — Physical isolation

Context: the existing terminal opened inside RoleMate, but Velora must be unrelated. Chosen: use
the empty Desktop folder `бот для ролплея с нейросетями`, initialise a separate Git repository and
require `.velora-project` in every toolkit script. Consequence: commands fail if run in RoleMate.

## 2026-08-09 — Free Cloudflare

Chosen: one Worker plus separate D1 databases, no paid plan and no billing auto-upgrade. Queue work
is optional/bounded; no Durable Object dependency in the initial release. R2 is not enabled, so use
a media interface backed first by Telegram file IDs.

## 2026-08-09 — One-time AI budget

Chosen: BotHub pay-as-you-go with manual funding only, auto top-up/recurring payment prohibited,
and hard application caps. No launch purchase is approved until the owner sees the authenticated
payment methods, exact amount and a minimal live reconciliation. Funds are reserved for visible
roleplay; auxiliary AI cannot spend them silently.

## 2026-08-09 — Safe Markdown rendering

Chosen: render chat content as React nodes with `react-markdown`, GFM extensions and
`rehype-sanitize`; raw HTML is skipped and default safe URL transformation is retained. This
avoids `dangerouslySetInnerHTML` while supporting the required roleplay formatting. The decision
follows the maintainers' documented secure-by-default guidance:
https://github.com/remarkjs/react-markdown#security.

## 2026-08-11 — Explicit private draft previews

Chosen: a creator may test only their own character draft through an explicitly marked preview
conversation. A normal conversation still requires a published visible character. Preview chats
retain immutable character/persona snapshots, are labelled in the UI and are excluded from public
creator chat statistics. This prevents author testing from weakening publication gates or
polluting audience metrics.

## 2026-08-11 — Short, idempotent onboarding

Chosen: first launch has four compact UI steps and only policy acceptance is mandatory. Mature
visibility and persona creation are optional. One D1 completion row per user makes retries safe;
optional persona creation and completion execute in one batch, and account erasure removes the
completion. Recommendations use only published SAFE characters so onboarding cannot bypass age or
moderation gates.

## 2026-08-11 — Autosave drafts, never implicit published edits

Chosen: the sectioned character editor autosaves only new/private drafts after native form
validation and serializes writes against the latest returned immutable version. Input arriving
during a request is debounced into the next save. Published or moderation-pending characters show
dirty state but require the explicit Save action, preventing accidental republishing or review
creation while typing.

## 2026-08-11 — Inspect the exact prompt, never a second approximation

Chosen: Prompt Inspector consumes diagnostic metadata produced by the same deterministic builder
used for generation. It exposes the rendered character sections, memory, activated lore, retained
branch messages and token estimates only to the character creator or an administrator/owner who
owns the inspected conversation. A normal reader's conversation with another creator's character
fails with 403, so creator instructions are not converted into a public character field.

## 2026-08-12 — Measured lazy boundaries with a hard bundle budget

Context: the production web build emitted one 650,138-byte entry even though chats, Markdown and
the lorebook editor are not required on first paint. Options: silence the warning, raise the limit,
manually configure vendor chunks, or split at product navigation boundaries. Chosen: lazy-load the
authenticated app after verified Telegram auth, then lazy-load Chats and Lorebooks on demand; use
the generated manifest to cap both the entry and every JavaScript chunk at 350,000 uncompressed
bytes. Consequences: the initial artifact is 306,635 bytes; loading states are required and tested;
build, integration and browser gates fail if the split silently regresses.
