# API specification

Base path: `/api/v1`. JSON errors use `ERROR_MODEL.md`; mutating requests accept an
`Idempotency-Key` where specified.

- `POST /auth/telegram`, `POST /auth/logout`, `GET /me`
- idempotent `POST /onboarding/complete` records explicit policy acceptance, an optional guarded
  Mature choice and at most one optional private default persona
- `GET/PATCH /settings`, `POST /age-gate`; model-profile changes are checked against the current
  non-expired server-side plan
- `GET/PATCH /profiles/me` and privacy-aware `GET /profiles/:userId`; the product profile is
  separate from Telegram identity, accepts only an owned non-rejected image avatar and never
  exposes Telegram usernames
- CRUD `/personas`, `/characters`, `/lorebooks`; lore entries at
  `/lorebooks/:id/entries`; owner-only safe transfer uses versioned
  `GET /lorebooks/:id/export` and atomic idempotent `POST /lorebooks/import`
- `POST /characters/assist` returns a bounded, rate-limited Workers AI draft for exactly one
  allowlisted character field (`tagline`, `description`, `personality`, or `firstMessage`). It
  never writes a character; applying the suggestion remains an explicit client action followed by
  the normal validated autosave/versioning path
- character and conversation lore attachments at
  `/characters/:id/lorebooks/:lorebookId` and
  `/conversations/:id/lorebooks/:lorebookId`
- deterministic creator/debug inspection at `/conversations/:id/lore/active`
- `GET /discovery`, public character detail at `GET /discovery/:characterId`; text search covers
  character name, creator, description and tags
- idempotent like/bookmark state at `PUT/DELETE /discovery/:characterId/like` and
  `/discovery/:characterId/bookmark`
- one-per-user optional rating/review at `PUT/DELETE /discovery/:characterId/review`; public,
  bounded review list at `GET /discovery/:characterId/reviews`
- identity-free owner aggregates at `GET /discovery/creator-stats/me`
- `GET/POST /conversations`, `GET/PATCH/DELETE /conversations/:id`; creation accepts a validated
  `greetingIndex`, while patching controls the model profile, response length, temperature,
  maximum output tokens, persona mode and per-chat instructions
- `GET/POST /conversations/:id/messages`, immutable branch edit at
  `/conversations/:id/messages/:messageId/edit`
  - every message exposes `contentFormat`, `isGreeting`, `editedByUser`, `origin`, `createdAt`,
    `updatedAt` and its lifecycle status; internal rows use role `INTERNAL` and are never projected
    into the reader's visible branch
  - a selected character greeting is copied into the new conversation as the first `ASSISTANT`
    message with `isGreeting=true` and `origin=CHARACTER_GREETING`; the character version remains
    unchanged
- idempotent active-branch selection at `PUT /conversations/:id/active-message/:messageId`;
  `descend=1` restores the latest surviving descendant of that variant
- branch-aware soft deletion at `DELETE /conversations/:id/messages/:messageId`; dependent
  descendants are removed together and memory becomes stale
- SSE generation at `/conversations/:id/generate` and stop at
  `/conversations/:id/generate/:generationId/stop`; generation mode is `REPLY`, `CONTINUE` or
  conversation-scoped `GREETING`
- memory inspector/edit at `/conversations/:id/memory` with separate `manualContext` and
  `autoSummary`; background summarize/full-regenerate never mutates the manual block,
  job status, explicit keep-current, version list and restore under the same resource; the read-only
  `POST /conversations/:id/memory/regenerate/preview` returns the current/generated comparison
  without creating a job or version, while stale state includes the exact
  `staleSinceMessageId`
- read-only `GET /conversations/:id/prompt-inspector` reuses the exact active prompt assembly and
  returns rendered character, memory, active lore, retained branch messages and token estimates;
  it is available only when the conversation owner also owns the character, or has `ADMIN`/`OWNER`
  role, so a normal reader can never inspect another creator's hidden instructions
- `GET /billing/packs`, `GET /billing/access-packs`, `GET /billing/payments`,
  `POST /billing/invoices`; every invoice creates exactly one credit or plan-access purchase
- owner-only `GET/POST/PATCH /admin/billing/packs`, `/admin/billing/access-packs` and
  `GET/PATCH /admin/billing/plans`; prices are never seeded implicitly and every change is audited
- owner-only `GET/POST /admin/billing/user-grants` resolves an internal Velora ID or Telegram ID,
  issues an audited non-renewing plan period and/or AI credits idempotently without creating a fake
  payment; `DELETE /admin/billing/user-grants/:grantId/access` revokes only its plan access
- Telegram webhook handles exact Stars pre-checkout, successful one-time grants and refunds
- `GET/POST /reports`, `GET/POST /appeals`
- role-restricted queue/detail/assign/action endpoints under `/admin/moderation/cases`
- administrator appeal decisions under `/admin/moderation/appeals` and read-only `/admin/audit`
- contextual, non-sanctioning user risk signals at `/admin/moderation/risk/:userId`
- evaluated boolean-only `GET /feature-flags`
- aggregate admin `GET /admin/operations/dashboard`
- owner-only `GET/POST /admin/operations/ai-smoke`; POST requires the exact confirmation
  `ПОТРАТИТЬ 1 ЗАПРОС V3`, is permanently idempotent for its versioned checkpoint and never exposes
  or stores prompt, provider response body or generated content; GET includes immutable prior runs
  and the allowlisted intersection of the authenticated BotHub model catalogue
- owner-only `GET /admin/feature-flags` and
  `PATCH /admin/feature-flags/:key`; rollout changes apply without a deploy and are audited
- `GET /media` returns owned media plus the current direct-upload capability; `POST /media`
  accepts only binary JPEG/PNG/WebP up to 10 MB when the private R2 binding is available, inspects
  actual bytes and geometry, generates an opaque owner-scoped object key, and treats the optional
  source filename as display-only metadata; base64 image payloads are never stored in D1
- `POST /media/generate-avatar` uses the bound Workers AI image model under plan-aware and global
  daily limits, returns an ephemeral JPEG payload, and relies on the normal authenticated
  `POST /media` path for inspection, private storage, moderation metadata and selection
- `/media/:id/content` applies the same owner/moderator/public-reference checks to Telegram and R2
  bytes; `DELETE /media/:id` removes the R2 object before soft-deleting its D1 metadata, while
  scheduled account erasure deletes every remaining owner object before database erasure
- owned support requests at `GET/POST /support/requests`; administrator queue and state updates
  under `/admin/support/requests`
- `/health`, `/ready`, `/openapi.json`

The generated OpenAPI document becomes the contract source once routes are implemented.

Character authoring includes scenario, goals, rules, creator instructions, post-history
instructions, example dialogues, alternate greetings and private creator notes. Public discovery
returns selectable greetings but never exposes private prompt instructions or creator notes.

Rate-limited routes return `429 RATE_LIMITED` with a safe scope and retry delay plus
`x-ratelimit-limit`, `x-ratelimit-remaining` and `x-ratelimit-reset` on accepted requests.
