# Velora verification report

## 2026-08-26 greeting, memory and per-user model roadmap completion

- Character conversations expose every configured greeting as sibling root variants. Compact
  borderless `<` / `>` controls switch the active greeting without creating another message.
- Conversation memory is presented as one editable document. Restore, incremental summarization
  and full regeneration all refresh that document; generated memory uses the requested structured
  sections for active characters, actions, dialogue summary, plot, personalities and relationships.
- AvatarBot greeting controls edit the existing Telegram message. Generated AvatarBot replies keep
  per-recipient variants with compact backward/forward controls; group callbacks are restricted to
  the Telegram user for whom the original reply was generated.
- AvatarBot model preferences are isolated by `(avatar_bot_id, telegram_user_id)`. Every registered
  user can open the model menu: Free sees only Free models, Premium sees Free and Premium, and Pro
  sees all currently provider-validated models. Every button includes its minimum tariff label and
  changing it edits the existing menu immediately.
- Alice and Lena have several production-seed greeting variants and dedicated attached Lorebooks;
  migration `0063_character_greeting_and_lore_depth.sql` remains additive and passed clean-D1
  migration and integrity checks.
- The complete no-retry quality gate passed: secret scan, formatting, documentation links, ESLint,
  strict TypeScript, 353/353 unit and regression tests, 7/7 roleplay-quality tests, 5/5 OpenAPI
  contract tests, 126/126 integration tests, local D1/Worker/load smokes, both production builds,
  bundle budget and 20/20 Playwright scenarios across iPhone, Android, tablet and desktop.
- This verification used Wrangler `--dry-run`; it did not mutate Production D1, deploy the Worker,
  or change Telegram webhooks.

## 2026-08-26 owner-approved production release

- The owner completed the refreshed 46-state visual review and explicitly authorized Production.
- The guarded deployment reran the complete no-retry gate immediately before mutation: secret
  scan, formatting, docs, ESLint, strict TypeScript, 337 unit/regression tests, 7 roleplay-quality
  tests, 5 OpenAPI contract tests, 126 integration tests, local D1/Worker/load smokes, both builds,
  bundle budget and 20/20 Playwright scenarios across iPhone, Android, tablet and desktop.
- A 274,278-byte production D1 export was captured before migration 0061 at
  `backups/production-updates/velora-production-pre-update-20260825T232606Z.sql`; its SHA-256 is
  `16A0CEEF3A9AF0A9D4CF407F72700B57E5E41411F3699A66A52C0CCC481861DD`.
- Additive migration `0061_lorebook_cover_media.sql` applied successfully. Production D1 now
  reports 61 migrations, `quick_check=ok` and no foreign-key violations.
- Production Worker version `17b01904-8207-40dd-bd4d-d621338860e6` is live at
  `https://velora-app.carreljeremih.workers.dev`; it serves JavaScript `index-CTra_eOF.js` and CSS
  `index-CNV9S_qs.css`. `/health=ok`, `/ready=ready` and OpenAPI 3.1 passed after propagation.
- The production model catalogue exposes both reviewed Free routes and the verified DeepSeek
  standard route as available. MainBot and Alice webhooks still target Production, have zero
  pending updates and no Telegram error. The deployment did not alter Telegram configuration.
- Release evidence is stored in
  `backups/production-updates/release-20260825T232606Z.json`.

## 2026-08-26 owner visual review remediation candidate

- Imported the owner-authored review from `C:\Users\User\Downloads\velora-visual-review.json`
  without rewriting its decisions: 25 states are marked PASS and 21 states remain marked FAIL in
  that source review.
- Remediated the shared causes behind the failed states: character/persona avatar editing,
  compact library navigation and filters, character-card expansion geometry, review/action layout,
  FAQ selection, chat-header reactions, long-text wrapping and tablet/desktop grid behavior.
- Added a browser regression proving an expanded character card consumes the complete grid width;
  removed the last negative positional CSS hack instead of masking the alignment issue.
- The no-retry quality gate passed: secret scan, formatting, documentation links, ESLint, strict
  TypeScript, 337/337 unit and regression tests, 7/7 roleplay-quality tests, 5/5 OpenAPI contract
  tests, 126/126 integration tests, local D1 integrity, Worker/API and load smokes, web/Worker
  builds, bundle budget, and 20/20 Playwright scenarios across iPhone, Android, tablet and desktop.
- Cloudflare deployment was validated only with Wrangler `--dry-run`. No production Worker, D1,
  Telegram menu or webhook was changed in this verification run.
- The 21 owner-marked FAIL states require a fresh human visual review before they can honestly be
  promoted to PASS. Production remains pending explicit owner authorization after that checkpoint.

## 2026-08-24 Free-model catalogue and visual-token verification

- The authenticated BotHub catalogue currently exposes 498 entries. The public and key-scoped
  checks confirm `mistral-nemo` and `l3-lunaris-8b`; the live Velora production catalogue reports
  both corresponding profiles as `available=true` and `tier=free`.
- Current public prices are 2.24/3.54 RUB per 1M input/output tokens for Mistral Nemo and 4.71/5.89
  for Lunaris. Model choice changes provider price, not the number of prompt tokens; branch, memory,
  lore selection and the server output cap remain the actual usage controls.
- Fourteen consumed CSS custom properties had no definition, causing complete browser declarations
  to be discarded on affected components. Canonical aliases are now defined, and a regression
  proves the product stylesheet consumes zero undefined custom properties.
- Fresh iPhone `actual`/`diff` evidence was regenerated and promoted for all 46 controlled visual
  states. Exact visual parity and human Telegram-device approval remain open and are not claimed.
- The final no-retry gate passed: secret scan, format, docs, lint, strict typecheck, 319/319 unit and
  regression tests, 7/7 roleplay quality, 5/5 OpenAPI contract, 122/122 integration, load smoke,
  web/Worker builds and 20/20 Playwright across iPhone, Android, tablet and desktop.
- Production Worker `3087bd98-ca67-4443-86f7-2558c17bdb5f` now serves JavaScript
  `index-BhwEf-h1.js` and CSS `index-CYD06LJb.css`; the served CSS contains the repaired spacing and
  accent aliases. `/health=ok` and `/ready=ready` after propagation.
- Production D1 remained read-only during this hotfix and reports `quick_check=ok`, no foreign-key
  violations and 58 applied migrations. Both Free overrides remain enabled with tier `free`.
  MainBot and Alice webhooks still target production, have zero pending updates and no last error.

## 2026-08-24 Lorebook and compact chat production hotfix

- Alice's active production Lorebook was confirmed linked to `alice-dvachevskaya`; its accidental
  case-sensitive matching was disabled so `ДваЧе`, `Дваче` and other case variants activate the
  same entry in MainBot and AvatarBot.
- Shared roleplay prompting now marks activated Lorebook content as binding canon for the current
  turn and explicitly requires the matching emotion, voice, reaction or consequence to appear in
  the response instead of being silently remembered.
- Message actions render through a document-level portal and are positioned against their real
  trigger, preventing animated message cards, the composer and bottom navigation from clipping the
  menu. The chat header, message typography, composer, send control and Lorebook editor use a more
  compact shared geometry; character hero images fill the media surface with focal-point-aware
  `cover`.
- Secret scan, formatting, documentation checks, ESLint and strict TypeScript passed. Unit and
  regression tests passed 319/319, roleplay quality 7/7, OpenAPI contracts 5/5, integration
  122/122, and Playwright 20/20 across iPhone, Android, tablet and desktop. The responsive chat
  matrix includes 320x568, 360x640, 375x667, 390x844, 412x915, 471x630 and 768x1024.
- Production D1 reports `quick_check=ok`, no foreign-key violations, an enabled Alice character
  link and `case_sensitive=0` for the corrected entry. Production Worker version
  `5bf1dc61-c229-4a71-be8d-8d6085577ed9` is live and serves the current CSS/JS assets.
- `/health=ok` and `/ready=ready`; MainBot and Alice webhooks both target production, have zero
  pending updates and no Telegram error. No unbounded paid-model call was made as part of this UI
  and deterministic prompt hotfix.

## 2026-08-24 monolithic final-tree verification

`toolkit/verify.ps1` passed end to end on the deployed source tree: secret scan, formatting,
documentation links, ESLint, strict TypeScript, 319 unit/regression tests, 7 roleplay-quality tests,
5 OpenAPI contract tests, 122 integration tests, local Worker/D1/R2-adapter and load smokes, both
production builds, bundle budget, and 20/20 Playwright scenarios across iPhone, Android, tablet and
desktop. Canonical visual approval and real Telegram device evidence remain separate human gates.

## 2026-08-24 DeepSeek and AvatarBot production hardening

- Repeated catalogue, direct, streaming and signed Worker checks approved only
  `deepseek-chat-v3-0324`; three unstable requested DeepSeek IDs remain hidden.
- Active character Lorebooks now enter AvatarBot system context. Bot-authored updates are ignored,
  and a visible roleplay smoke requires two independent explicit confirmations.
- Focused regressions passed 19/19; lint, strict TypeScript, web build, bundle budget and Worker
  dry-run passed. Production Worker `e82f1114-897a-4cf4-86f1-2d7345fab158` is live.
- Remote D1 reports `quick_check=ok` and zero foreign-key violations. MainBot and Alice webhooks
  match production, have zero pending updates and no Telegram error.

Updated: 2026-08-24.

## 2026-08-24 production deployment evidence

- staging Worker version `15df0f45-89b8-4145-a3bc-ae8f374db4cd` passed `/health=ok`,
  `/ready=ready`, D1 integrity checks and served the new hashed web assets;
- a production D1 export was captured before migration 0057 at
  `toolkit/backups/velora-production-pre-0057-20260824T0215.sql` (151,359 bytes,
  SHA-256 `F4E8E7578D7C433644395FFD59F43A71A9A2ADE7B4D65A16D9AF98CDE3ABF354`);
- production migration `0057_enrich_alice_roleplay.sql` is applied. A remote content query confirms
  Alice's active version contains the 3-6 paragraph instruction and starred-action instruction;
- production D1 reports `quick_check=ok`, an empty `foreign_key_check`, and 57 applied migrations;
- production Worker version `8eca1cb3-c444-43e6-8bb9-13b1bf451654` is deployed at
  `https://velora-app.carreljeremih.workers.dev` with cache version `20260824-1`;
- production serves `/health=ok`, `/ready=ready`, JavaScript asset `index-DcCw6MAf.js` and CSS asset
  `index-CmWADudg.css`;
- a fresh production Telegram recheck processed Alice `/info` and private AI updates, confirmed the
  complete six-command menu, and ended with both main and Alice webhooks at zero pending updates and
  no Telegram `last_error_message`;
- only provider routes already proven by bounded real calls remain enabled. Failed replacement
  routes (`deepseek-r1-0528`, `rocinante-12b`, `qwen3-8b`) remain fail-closed instead of being shown
  as usable models.

### Alice quality hotfix

- a second production export was captured before migration 0058 at
  `toolkit/backups/velora-production-pre-0058-20260824T024049.sql` (159,447 bytes,
  SHA-256 `4CB38F02BB47D6A0F7C2E112809E439CC9C7AED7B40F0CB73317FA1DF8FE32DD4`);
- migration `0058_alice_balanced_model.sql` moves only the owner reference Alice Character Bot from
  the economical Lunaris route to the already validated `deepseek-chat-v3.1` route;
- the exact post-migration quality smoke completed with 437 output tokens and persisted a coherent
  1,129-character Russian scene with 22 starred-action markers, atmosphere and plot progression;
- production D1 reports 58 migrations, `quick_check=ok`, and an empty foreign-key check after the
  hotfix.

## 2026-08-24 character image, chat and roleplay release candidate

- the character hero preview trigger now fills the complete media surface and the rendered image
  uses focal-point-aware `cover`, removing the intrinsic square/letterbox around portrait artwork;
- the chat header now has bounded avatar, title, model selector and menu flex items; long titles are
  ellipsized, message typography uses the shared semantic token, the composer remains a normal flex
  item, and the message list remains the sole vertical scroll surface;
- the shared Mini App roleplay prompt now requires persistent character voice, natural `*actions*`,
  scene progression, 3–6 cohesive paragraphs by default and no puppeteering of the user;
- migration `0057_enrich_alice_roleplay.sql` removes Alice's conflicting forced-short-answer rule and
  enriches her active character definition without deleting conversations or other user data;
- focused regression: 91/91; full gate: secret/format/docs/lint/strict typecheck, 317/317 unit,
  7/7 roleplay-quality, 5/5 contract, 120/120 integration, D1 integrity/load smoke, build and
  20/20 E2E across iPhone, Android, tablet and desktop;
- the production Worker dry-run and the subsequent staging and production deployments passed with
  cache version `20260824-1`; deployment and remote database evidence is recorded above.

VeloraAI release `1fe476b2-6a58-4c47-adb1-376801862cd8` is deployed to production. Telegram
Stars purchases remain deliberately disabled until a real Stars transaction can be completed; Free
generation and owner-granted Premium/Pro access are enabled. No claim of a verified real payment is
made in this report.

## 2026-08-22 production release evidence

- secret scan, formatting, documentation checks, lint and strict TypeScript passed;
- 290 unit/regression, 7 roleplay-quality, 5 OpenAPI contract, 110 integration and 35 focused
  component tests passed;
- the complete E2E set passed on iPhone, Android, tablet and desktop after correcting two stale or
  unstable test interactions; visual and accessibility checks are included in those journeys;
- production build passed with the initial JavaScript bundle at 349,900 bytes;
- migration `0038` was corrected before remote production application after staging exposed an FK
  rebuild defect; local D1 and populated staging D1 then passed all 47 migrations and integrity checks;
- a production D1 export was captured before migration 0048 at
  `toolkit/backups/velora-production-pre-0048-20260822T040346.sql` (83,987 bytes); all 48 production migrations are
  applied, `quick_check=ok`, `foreign_key_check` is empty, and no migration is pending;
- production `/health=ok`, `/ready=ready`, the new hashed assets are served, and cache version
  `20260822-2` is active;
- production has the BotHub, session, Telegram webhook, Telegram bot and child-bot encryption
  secrets; secret values were never printed;
- `@aivel0ra_bot` reports zero pending webhook updates and no last webhook error; its webhook points
  to the production Worker, and its verified Mini App menu is `Открыть` with cache version
  `20260822-2`;
- public character profiles expose an active Telegram avatar bot through `Добавить персонажа в чат`;
  owner-only plan/staff controls, moderator-safe user/character directories, block/unblock and role
  badges have regression coverage;
- production flags: sponsored Free AI enabled, entitlement-gated Premium/Pro AI enabled, Stars
  checkout disabled pending a real transaction.

### 2026-08-22 monochrome UI and Free-model routing update

- the remaining purple fallback palette was replaced with semantic graphite, black, white and soft
  gray tokens in dark, AMOLED and light modes; the light-theme accessibility journey initially
  exposed a 4.48:1 muted-text contrast, which was corrected before release;
- the subscription plans are a horizontal snap carousel with smooth scrolling, bounded previous/next
  controls, clickable position indicators, keyboard arrows, centered card snapping and hidden native
  scrollbars; focused regression coverage verifies the three-card navigation contract;
- one no-retry production-build run passed the complete stateful and language/group-filter journeys
  on tablet and desktop (4/4 in 5.6 minutes). It emitted all 46 unique reference states for each
  project with no missing IDs. The evidence builder persisted 46 tablet actual/diff pairs and 46
  desktop actual/diff pairs alongside the phone evidence; the traceability regression now requires
  all 322 non-empty artifacts;
- the Create hub no longer contains the group responder policy; contextual/manual responder choice
  remains a chat-time control, while mobile layout and long profile identity wrapping were corrected;
- iPhone, Android and desktop production-build journeys passed 5/5 each. Tablet passed the complete
  5/5 behavior set after one isolated Playwright stability timeout was reproduced as an exact rerun
  and passed; this is reported as a test-runner flake rather than hidden;
- staging and production both completed bounded live BotHub checks for `l3-lunaris-8b` and
  `mistral-nemo`. Production evidence recorded 89/64 and 78/16 input/output tokens respectively;
- migration `0048_restore_economical_roleplay_routes.sql` enables the reviewed economical Free
  routes. Production `quick_check=ok`, `foreign_key_check` is empty, health is `ok`, readiness is
  `ready`, and hashed assets `index-CF0R1Ns9.js` / `index-MgcSYBOO.css` are served;
- the Telegram Mini App menu was independently set and read back as `Открыть` with URL cache key
  `v=20260822-2`. Payment remains deliberately disabled.

## Verified evidence

- all ten component-test targets from master-contract section 148 are real production components and
  have focused tests; the discovery `FilterSheet` also has a reviewed production-like screenshot,
  zero critical/serious axe findings, and an E2E proof that `language`, `rating`, and `tags` reach the
  catalog API and reset correctly;
- section 149 now has direct unit coverage for all nine named categories; the current repository gate
  contains 277 unit/regression tests;
  the added branching regression also fixed a real opaque-ID collision between a root marker and a
  possible parent ID;
- the section 151 core journey now performs edit, regenerate, memory summarize and reload persistence
  rather than checking only that controls exist; it passes the desktop, Android and iPhone projects;
- the release evidence set passed on 2026-08-21: secret/format/docs/lint/strict typecheck, 277 unit,
  7 roleplay-quality, 5 contract, Worker+D1 plus 107 integration tests, both builds, 15 E2E,
  3 visual and 6 a11y runs;
- interrupted provider streams now retain every received delta as a visible `FAILED` assistant
  message, keep that non-empty response as the active branch, permit continuation, and refund the
  user balance; the real Worker+D1 integration forces a delta followed by a provider error and proves
  persistence across a subsequent active-branch read;

- isolated workspace and Git repository; RoleMate was not modified;
- private GitHub repository `Jeremih333/velora` with a clean-clone CI gate covering portable secret
  scanning, formatting, lint, strict typecheck, unit/integration tests, build and responsive E2E;
- the root owner README now documents requirements, installation, local development, environment
  separation, D1/R2/Workers, BotFather/Telegram, BotHub, migrations, deployment, tests,
  backup/restore and the explicit production gates from zero without embedding secrets;
- Cloudflare Free-only architecture with no card or automatic plan upgrade;
- separate `velora-staging` and `velora-production` D1 databases;
- production D1 has all 41 reviewed migrations and passed `quick_check` plus a zero-result
  `foreign_key_check`; a 54,227-byte pre-update export was captured before migrations 0029–0041;
- staging D1 migrations 0001-0028 passed; `quick_check` returned `ok` and
  `foreign_key_check` returned no violations;
- pre-0003, pre-0004, pre-0005, pre-0006, pre-0007, pre-0008 and pre-0009 staging backups were exported before their migrations;
- staging Worker version `6ddd97be-6a12-4011-8a1c-606fbdb4e64f` is live with a five-minute
  recovery schedule for due background jobs;
- staging `/health`, `/ready`, public config, static shell and CSP smoke passed;
- the public OpenAPI 3.1 route contract is generated from the concrete Hono route table, exposes
  all 104 current paths, models cookie/CSRF/webhook-secret boundaries, path parameters, the SSE
  generation media type and the stable safe error envelope; four contract regressions and a real
  Wrangler route smoke prevent Cloudflare Assets from silently replacing it with the SPA;
- persona CRUD/default and character immutable-version CRUD/publish/discovery pass against a real
  local Worker with D1 and CSRF;
- the character editor is divided into basics, personality, scenario, first message, examples,
  instructions, lore, appearance and publishing; valid drafts autosave serially against the latest
  immutable version with visible status, while published/review-pending edits remain explicit;
- likes and bookmarks are idempotent under repeated requests, one-per-user reviews enforce their
  database bounds, self-interaction is rejected, and identity-free creator aggregates pass the
  real Worker+D1 flow;
- character cards expose responsive like/bookmark controls, rating summaries and optional reviews;
  the complete interaction flow passes Android, iPhone and desktop E2E;
- every Mature publication and every edit to a published Mature character is removed from public
  discovery until an authorized moderator approves its single active system review; cancellation,
  re-review and invalid-action denial pass the real Worker+D1 flow;
- literal discovery search no longer relies on SQLite `LIKE` for Cyrillic input; the `instr`-based
  regression prevents the observed `LIKE or GLOB pattern too complex` D1 failure;
- Telegram image storage validates actual bytes and parses real PNG, baseline/progressive JPEG and
  VP8/VP8L/VP8X WebP dimensions; malformed headers, decompression-bomb geometry and mismatched
  Telegram declarations are rejected before D1 persistence, while owner isolation and proxy/delete
  pass a real webhook-to-media integration flow;
- immutable message branches, idempotent writes, manual memory versions and restore are exercised
  against a real local Worker and D1;
- the owner manually confirmed the live Telegram Mini App continuation flow: the original answer
  remained intact, the continuation was a separate message and the edited branch was selectable
  through the visible `2 / 2` control; this evidence was recorded without issuing another paid AI
  request or copying private roleplay text;
- memory jobs have conditional leases, bounded exponential retry/dead-letter handling and
  duplicate-write protection; the no-cost extractive/hierarchical fallback traverses a tested
  1,201-message branch in pages without spending AI credits or dropping its beginning or end;
- the Mini App memory inspector exposes source, token estimate, stale choice and manual editing;
- the BotHub-compatible SSE adapter is tested with fragmented streams, conservative usage-cost
  accounting, output limits, expired-lock recovery and stop/completion race protection;
- explicit BotHub content-policy codes and finish reasons are converted into a localized safe
  explanation without exposing provider diagnostics; unit, SSE transport and real Worker+D1
  regression tests prove that this non-retryable failure neither triggers fallback nor debits credits;
- transient generation performs one exponentially delayed primary retry followed by at most two
  explicitly priced fallbacks; authentication/abort/partial-stream errors do not switch models,
  and the integration flow proves a single persisted answer and ledger charge after fallback;
- user credits are charged only after successful roleplay generation, while conservative provider
  spend for every started retry/fallback attempt is retained separately for global budgets;
- the authenticated Mini App can start a story from discovery and stream the reply in a chat view;
- conversation creation accepts the safe opaque character identifiers returned by the catalogue;
  a regression starts a real Worker+D1 conversation for a deterministic staging character instead
  of rejecting it as a malformed UUID;
- creators can open an explicitly labelled private test chat for their own draft; ordinary draft
  chats and foreign preview attempts are denied, immutable character/persona snapshots are kept,
  and previews do not increase creator chat statistics;
- new users receive a four-step first run instead of a long mandatory wizard: policy acceptance
  is explicit, Mature visibility and a private persona are optional, completion is idempotent,
  SAFE recommendations are real catalogue entries and a selected story opens immediately;
- alternate greetings render against the selected persona, advanced author fields survive editing,
  example dialogues are context-bounded, and per-chat generation settings reach the provider;
- Prompt Inspector is generated by the exact same prompt builder as inference and shows rendered
  character sections, memory, active lore, retained branch messages and token estimates only to
  the character creator or administration; a foreign reader's real Worker request returns 403;
- the explicit A-F roleplay quality corpus covers simple English, Russian roleplay, a large
  definition, multiple lore entries, heavy documented templates and a 360-message branch through
  the real prompt/lore builders; it exposed and fixed one-level nested template leakage, and now
  verifies relevant context, unrelated-lore exclusion, branch retention and token bounds without
  spending BotHub CAPS;
- GitHub CI `31530811020` independently passed the complete Linux gate for the A-F corpus and
  nested-template fix before staging deployment;
- completed and streaming messages use sanitized Markdown without arbitrary HTML or unsafe URLs;
  regenerate/continue, immutable edits, variant restoration, reports and branch deletion pass
  Worker+D1 and responsive UI regressions;
- deleting a conversation during an in-flight generation stops its records, releases the lock and
  is verified not to deduct AI credits after the provider finishes;
- lorebooks support strict CRUD, character/conversation attachments, deterministic Unicode key
  matching, ordering, token budgets, template expansion and active-context inspection;
- lorebooks support a strict versioned v1 JSON export and atomic idempotent import; imports are
  forced private, internal identifiers are excluded, owner IDOR is denied and transfers are
  bounded to 100 validated entries;
- the lore context is included in the actual generation prompt and its activated entry IDs are
  persisted with the generated message;
- reports, protected-role RBAC, moderation actions, suspended-account appeals, overturned-state
  restoration, contextual risk signals and append-only audit pass a three-user Worker+D1 flow;
- a single report signal is verified not to change account state or trigger an automatic sanction;
- owner-configurable Stars packs, exact `XTR` pre-checkout, successful grant, replay protection,
  forged-recurring rejection, owner-only `refundStarPayment` initiation and idempotent refund
  reversal pass a real local Worker+D1 flow;
- Free, Plus and Pro have typed server-side limits for resources, memory/lore, advanced daily
  operations, rate limits and model profiles; expired access is rejected on every protected call;
- owner-configured non-renewing access packs grant stackable fixed periods only after exact Stars
  payment; duplicate delivery cannot double-grant and refunds revoke the matching period;
- the user-facing payment history maps the internal atomic terminal state to `GRANTED`, exposes
  the actual fixed-term `validUntil` and always returns `autoRenew=false`; all pending, cancelled,
  expired and refunded states are localized instead of leaking internal labels;
- the MiniApp balance/purchase screen explicitly excludes cards, subscriptions and auto-top-up,
  requires consent and opens the native Telegram invoice; its flow passes all three E2E devices;
- both deploy configurations keep `PAYMENTS_ENABLED=false`, and staging has zero configured packs;
- route-specific user/plan limits cover auth, generation, character creation, search, reports,
  media, memory and session mutation; IP is verified as a non-blocking signal rather than a
  shared-NAT ban;
- request logs use normalized routes, request IDs, latency and hashed actor identity without
  private content; allowlisted events are privacy-bounded and completion events are idempotent;
- admins can inspect aggregate operations health and the owner can change validated deterministic
  feature flags without deploy; public review disabling is enforced by the backend and RBAC is
  covered by Worker+D1 and responsive UI tests;
- only the owner can appoint or revoke moderators by an already registered Telegram ID; staff
  cannot enumerate or modify other staff, and every role change is appended to the audit trail;
- the integration harness uses a fresh temporary D1 for every run, preventing prior AI spend or
  rate windows from contaminating results;
- the staging-only quality seed is fixed-ID and idempotent, is exercised twice on a temporary D1,
  and provides four visibly synthetic users, four personas, twelve SAFE characters, two lorebooks,
  a 240-message chat with memory and three moderation cases without creating sessions; the remote
  runner is allowlisted to the staging database ID and exported a pre-seed backup before import;
- reusable typed BotHub fixtures cover fragmented successful SSE, missing usage and an in-stream
  provider error without containing secrets or real private prompts;
- bounded local load smoke covers 40 concurrent authenticated users, D1 readiness and searches,
  plus four independent roleplay streams; the first observed higher-concurrency boundary is the
  configured AI budget, which fails closed instead of being raised automatically;
- chat history renders the latest 80 messages initially and reveals earlier batches explicitly;
  1,000-message unit and 100-message Android/iPhone/Desktop regressions prevent unbounded DOM use;
- offline transitions keep the authenticated shell mounted, preserve an unsent chat draft and
  expose a Russian network error; keyboard focus, named buttons, reduced motion and 200% font
  scaling without horizontal overflow pass the responsive E2E flow;
- dedicated `test:visual` and `test:a11y` commands now run the production-like authenticated
  journey on Android, iPhone and desktop. Axe reports zero critical and zero serious violations
  across home, discovery, creator profile, character profile, chat, memory, settings and Lorebook;
  introducing the gate exposed and fixed an invalid progressbar label, an unlabeled list role and
  light/dark moderation-button contrast defects;
- 24 reviewed Linux pixel baselines cover onboarding, search, character, creator, chat, memory,
  lorebook and settings across Android, iPhone and desktop; the review fixed host-preference theme
  leakage, WebKit native-control contrast and mobile navigation overlap, with semantic theme and
  composer-geometry regressions alongside the screenshots;
- the explicit 46-row final screenshot matrix now has phone, tablet and desktop actual/diff evidence
  for every controlled state. Exact reference parity is still graded independently, so responsive
  evidence is not misrepresented as pixel-perfect approval;
- exact reference state UI23 now has a server-authorized public character profile with hero, creator,
  description, tags, metrics, reactions, favourite, Share and story CTA. Internal `character` URLs and
  Telegram `tgWebAppStartParam` both restore the exact character; Share emits the environment-specific
  `startapp` link and falls back to clipboard. Phone/tablet/desktop state evidence and accessibility
  pass, while differing reference artwork keeps exact pixel parity unapproved;
- exact reference states UI24–25 now render the chosen greeting in a separate collapsed/expanded
  block through the same sanitized `SafeMarkdown` component as chat. The browser regression proves
  semantic bold/italic output, no raw Markdown, real `aria-expanded` state, full expansion and a
  race-free conversation start payload. Phone/tablet/desktop evidence and accessibility pass;
  visual parity remains independently unapproved;
- exact reference state UI26 now exposes the persisted creator handle and a real published-character
  catalogue with search, rating filter, newest/oldest sorting, exact result count, empty state and
  exact-character navigation. The focused component suite, local Worker/D1/API integration and the
  browser/a11y scenarios and exact-state captures pass on phone, tablet and desktop; visual parity
  remains independently unapproved;
- exact reference state UI27 now provides per-conversation selection, select all, cancel, a
  selection-aware destructive action, confirmation, visible deleting state and a return to the
  normal list without removing archive/restore controls. Its focused state-machine regression plus
  phone/tablet/desktop browser, a11y and exact-state evidence pass; visual parity remains independently
  unapproved;
- users can block creators bidirectionally at the server boundary; blocked characters, reviews and
  conversation starts are hidden/denied, with unblock management in settings;
- data controls expose a versioned export manifest, a seven-day cancellable deletion request and a
  bounded scheduled erasure worker; integration proves session/content removal, irreversible
  identity pseudonymization and retention of the financial record;
- the pre-0012 staging export was restored into a fresh temporary D1, migrated forward to 0012,
  integrity-checked at 54 tables/12 migrations and opened successfully by the real Worker; the
  temporary database was removed after the drill;
- the pre-0013 staging export was restored independently, migrated forward to 0013 and verified
  at 54 tables/13 migrations before the remote migration;
- the pre-0014 staging export was restored independently, migrated forward to 0014 and verified
  at 54 tables/14 migrations before the remote migration;
- the pre-0015 staging export was restored independently, migrated forward to 0015 and verified
  at 55 tables/15 migrations before the remote migration;
- the pre-0016 staging export was restored independently, migrated forward to 0016 and verified
  at 56 tables/16 migrations before the remote migration;
- the pre-0017 staging export was restored independently, migrated forward to 0017 and verified
  at 56 tables/17 migrations before the remote migration;
- the pre-0018 staging export was restored independently, migrated forward to 0018 and verified
  at 57 tables/18 migrations before the remote migration;
- the pre-0019 staging export was restored independently, migrated forward to 0019 and verified
  at 57 tables/19 migrations before the remote migration;
- the pre-0020 staging export was restored independently, migrated forward to 0020 and verified
  at 57 tables/20 migrations before the remote migration;
- the pre-0021 staging export was restored independently, migrated forward to 0021 and verified
  at 57 tables/21 migrations before the remote migration;
- the pre-0022 staging export was restored independently, migrated forward to 0022 and verified
  at 58 tables/22 migrations before the remote migration;
- the pre-0023 staging export was restored independently into the reviewed schema and verified at
  59 tables/23 migrations before the remote migration;
- private support tickets enforce user ownership and administrator RBAC, expose no message text in
  audit metadata, are included in the owner's export and erased with the account; Terms and Privacy
  are available in Mini App settings;
- Velora product profiles are separate from Telegram identity, keep Telegram usernames private,
  enforce avatar ownership and moderation visibility, respect bidirectional blocks, drive creator
  names in search/reviews/public cards, and support reversible profile-content moderation;
- the pre-0025 staging export was restored independently into the reviewed schema and verified at
  63 tables/25 migrations before the remote migration;
- owner deletion fails closed until ownership is transferred; deletion and block controls pass
  responsive desktop, Android and iPhone E2E;
- secret scan, formatting, lint, strict typecheck, 117 unit/regression tests, 4 API contract tests,
  25 integration/schema/cost-model tests, D1/API integration, builds, and 9 E2E cases without
  retries across Android/iPhone/desktop passed;
- post-deploy staging `/health`, `/ready`, protected data controls, unsigned webhook rejection and
  D1 integrity smoke passed; no migration remains pending;
- Telegram auth secrets for `@aivel0ra_bot` are installed and the Worker fails closed for unsigned
  webhook traffic; the scheduled reconciler verified the bot identity and applied the webhook,
  commands, menu button and descriptions with state `READY`.
- Telegram webhook rejects operation while secrets are absent, and command parsing, webhook-secret
  comparison and Telegram delivery handling have regression coverage.
- Telegram command, one-time payment and media replies are selected from typed Russian/English
  dictionaries; `en`, `en-US` and `en_US` normalization and the localized Mini App button pass
  unit and local Worker integration tests, while later in-app locale choices are preserved.
- the web runtime has typed Russian/English dictionaries and switches authenticated language
  without reload. Auth/standalone, offline recovery, onboarding, navigation, discovery, billing,
  settings, chats, editors, profiles, reports, private support, legal information, account data
  controls, moderation and owner operations are covered. Generic transport failures are translated
  at the rendering boundary, while safe domain messages remain available for diagnosis.
- live Telegram initData produced active sessions and automatically persisted the confirmed
  Telegram ID `1040929628` as `OWNER`, without a manual database role change;
- the installed BotHub key passed a non-generative authenticated model-list check. The former
  required `deepseek-v3.2-speciale` is absent; the allowlisted intersection is persisted without
  the full catalogue or secret, `deepseek-chat-v3.1` is selected, and reconciliation is `READY`;
- the explicitly consented V1 BotHub checkpoint was HTTP-rejected before output after 1,815 ms;
  D1 records zero tokens/cost and retains the failed run key without an automatic repeat. The
  owner separately confirmed an active ELITE plan and CAPS balance, so insufficient plan/balance is
  not treated as the established cause;
- V2 was blocked before its run key and before Chat Completions because its required model was
  missing. The owner-authorized V3 checkpoint completed once with `deepseek-chat-v3.1`, the
  documented streaming shape and HTTP 200: 42 input tokens, 20 output tokens, $0.000030 provider
  cost and 4,211 ms latency. It claimed its distinct D1 run key before network access, allowed no
  retry/fallback and stored only safe HTTP category, usage/cost, latency and output hash rather
  than prompt, response body or generated text;
- all deployed roleplay profiles now point only to the selected available model, while the
  independent `PAID_AI_ENABLED=false` server gate prevents any production/local user generation and credit/CAPS
  spend until the checkpoint succeeds and the owner separately approves enablement; even after
  enablement, a second readiness gate requires a completed V3 whose model matches both the active
  profile and reconciled BotHub capability;
- the first post-0020 E2E run exposed a mobile toast/sticky-header click obstruction; after the
  UI fix, the required Android/iPhone/Desktop rerun completed all 9 cases without retry.
- the staging-paid-enable gate on 2026-08-12 passed 117 unit/regression, 6 structural roleplay,
  4 contract and 26 integration tests. The full 9-case E2E run recorded one transient iPhone
  navigation retry; that exact scenario then passed independently with retries disabled.
- clean-clone CI `31538305930` passed before staging Worker
  `244d09fd-172e-4b3c-9fb0-12e671bc8c4e` was deployed with paid AI enabled and payments disabled;
  health/readiness, unauthenticated-generation 401, matching V3/provider readiness and D1
  `quick_check=ok` passed after deploy.
- owner grants by internal Velora ID or Telegram ID are owner-only, CSRF-protected, idempotent and
  audited separately from payments. Local Worker+D1 regression proved combined plan/credit issue,
  replay without double credit, effective Pro access, access revocation and retained credit. The
  full gate passed 118 unit, 6 roleplay-quality, 4 contract, 27 integration and 9/9 E2E tests;
  clean-clone CI `31541638382` passed. Fresh backup
  `velora-staging-pre-0026-2026-08-12T012235Z.sql` restored independently to 26 migrations and 65
  tables before the remote migration. Staging Worker `c5a53c7e-baa0-4923-ad45-facddae9fdfc`
  serves 102 OpenAPI paths, rejects unauthenticated grant reads with 401, retains one and only one
  V3 run, and keeps `PAYMENTS_ENABLED=false`. No owner grant was invented or applied by the
  deployment process; the owner subsequently created one deliberate grant through the new UI.
- after the owner deliberately granted credits and completed a real Russian chat in Telegram, a
  content-free D1 audit found the request, generation and persisted assistant message all
  `COMPLETED`: 413 input / 33 output tokens, 84 output characters, 7,080 ms latency and exactly one
  20,221-micro usage charge. The owner confirmed the rendered response; private message text was
  neither queried nor copied into this report. This closes the single live-chat transport and
  accounting checkpoint, but does not claim broad A-F live prose-quality coverage.
- owner-only Stars refund initiation is now CSRF-protected and claimed before the Telegram call;
  one payment cannot be submitted twice, ambiguous transport state is not retried automatically,
  and neither charge identifier is exposed in the API or UI. Unit, contract, local Worker+D1 and
  three-device E2E passed. Backup `velora-staging-pre-0027-2026-08-12T0218Z.sql` restored into the
  reviewed 27-migration/66-table schema before staging migration; Worker
  `48b3c4cf-fc4c-4a4c-bbdb-95df8edf22ea` is healthy with `PAYMENTS_ENABLED=false`. No real Stars
  invoice or refund was sent during this preflight.
- Telegram image ingestion now verifies actual PNG/JPEG/WebP geometry, rejects malformed,
  oversized-pixel and Telegram-metadata-mismatched files, and persists only inspected dimensions.
  The real local webhook-to-D1-to-owned-proxy path and all quality gates passed; staging Worker
  `a9d6eb18-7292-4cef-a5b3-0c6107fa4d11` is healthy with 104 OpenAPI paths, 27 migrations,
  `quick_check=ok`, no foreign-key violations and `PAYMENTS_ENABLED=false`; clean-clone GitHub CI
  `31549288372` passed.
- Every newly stored image now enters one deduplicated system moderation case. Evidence bytes are
  available only to the owner or staff allowed by the role hierarchy; approval makes a public
  reference readable, rejection keeps it private and deleting the file closes an active system
  review. The pre-0028 export restored independently into 28 migrations/66 tables; staging Worker
  `b57438ee-0283-4ccc-b752-69c440c6a6bf` is healthy with `PAYMENTS_ENABLED=false`; clean-clone
  GitHub CI `31552004619` passed the full gate.
- one uniquely identified synthetic `jobs.dead` signal produced exactly one Telegram warning that
  the owner confirmed receiving; the fixture was removed, its count returned to zero and the next
  cron persisted the alert as `RESOLVED` with no outstanding notification lease.
- the owner confirmed the non-payment legal/2FA checkpoint but has no real Stars, so no charge was
  attempted. A strictly isolated Telegram Test Server runtime was added instead: typed Bot API
  routing uses the documented `/test/` method path, runtime validation prevents production/test
  identity mixing, and unverified test-server media download fails closed. Its dedicated Free D1
  `velora-telegram-test` has all 28 migrations, 65 application tables, `quick_check=ok`, no
  foreign-key violations and no pending migrations. The test Worker dry-run resolves only that D1
  and keeps both paid feature flags `false`; deployment remains blocked on a separate test-server
  account and bot token.
- the guarded Test Server installer now performs a non-mutating dry-run and `/test/getMe` identity
  check before writing Cloudflare secrets, refuses the normal/placeholder bot identities, creates
  independent webhook and session secrets, deploys only the selected isolated Worker and applies
  webhook/menu configuration only after deployment succeeds. A regression locks this operation
  order; no secret, Worker deployment or Bot API mutation was performed while testing it.
- the annual BotHub estimator was reconciled with the current public tariff units: token prices
  remain RUB-denominated, the documented `$0.01` LLM request surcharge is converted through an
  explicit conservative USD/RUB input, and Elite is treated as the public 35,000,000 CAPS / 5,500
  ₽ pack rather than the owner's bonus-inclusive displayed balance. At the default 120 ₽/$ and
  8,000-input/600-output envelope, 100 replies/day plus 15% reserve is 61,026 ₽, rounded to twelve
  manually purchased Elite packs; this is a planning envelope, not a price or availability
  guarantee, and no purchase/renewal was performed.
- Cloudflare Free allowance observability now has a read-only, account-wide local guard for daily
  Worker requests, daily D1 rows read/written, total D1 storage and D1 database count. Regression
  tests lock the reviewed 70% warning and 85% critical boundaries, token non-disclosure and
  fail-closed behavior for incomplete analytics. The operator runbook requires a narrowly scoped
  Analytics/D1 read token and a human Billing dashboard comparison because Cloudflare explicitly
  describes GraphQL analytics as operational rather than billing-authoritative. The guard cannot
  buy, enable or upgrade a Cloudflare plan; no account mutation was made during verification.
- The web performance audit replaced the 650,138-byte monolithic entry with measured lazy product
  boundaries: 306,635-byte initial entry, 148,982-byte authenticated shell, 183,811-byte chat and
  13,225-byte lorebook editor. A Vite-manifest build gate rejects any JavaScript artifact above
  350,000 bytes or loss of the required lazy entries; Android, iPhone and desktop E2E prove Chats
  is not fetched before navigation and remains usable after its on-demand load. Clean-clone CI
  `31560140067` passed and staging Worker `afd1e97d-1ab8-47cf-b0e5-e63b00e78686` returned HTTP 200
  for the manifest and every exact lazy asset; health/readiness, 104 OpenAPI paths and D1 integrity
  remained healthy without changing paid feature flags.
- A clean-D1 first-run regression now signs Telegram `initData` for a previously unknown ID and
  proves server-side user/profile/settings initialization, safe defaults, atomic onboarding,
  optional persona creation, SAFE discovery, a persona-bound first conversation and its initial
  assistant message. The Mini App now forwards the returned onboarding `personaId` instead of
  silently discarding it; Android, iPhone and desktop lock the exact conversation payload.
- The complete local gate and clean-clone CI `31562407535` passed this first-run change. Staging
  Worker `e928ec7f-610f-47c5-85c2-b78ec18294fd` serves the fix with health `ok`, readiness `ready`,
  unauthenticated `/me` 401, 104 OpenAPI paths and 28-migration/66-table D1 integrity. No migration,
  secret, production resource, payment configuration or paid-AI gate changed; payments remain off.
- The first-run suite also reproduces simultaneous reuse of one valid signed `initData`. The D1
  nonce uniqueness is the serialization point: one request wins with 201 and one maps the race to
  `409 INIT_DATA_REPLAYED`; no 500 and no second successful session are allowed.
- Concurrent-login hardening passed the complete local gate and clean-clone CI `31563647374`, then
  shipped only to staging Worker `eeab29c5-600b-4df8-a652-17ad773e8055`. Health/readiness,
  root/OpenAPI, protected-session rejection and 28-migration/66-table D1 integrity passed; no
  migration, production resource, payment flag or provider request changed.
- A reproducible SLO baseline now performs only 3–30 sequential read-only samples against
  allowlisted local/staging origins; production is rejected in code. The first full-timing staging
  run made 48 requests with zero failures. Recorded p95 was 297.8 ms health, 134.5 ms D1 readiness,
  102.7 ms public config and 68.7 ms OpenAPI. Launch objectives remain provisional until 30 days of
  production evidence and therefore are not presented as guaranteed availability.
- Its full local gate passed 129 unit/regression, 6 quality, 4 contract and 41 integration checks
  plus builds. One desktop shell startup exceeded 30 seconds and passed Playwright's retry; the
  exact scenario then passed 3/3 with retries disabled, so the flake is disclosed rather than
  converted into a false clean-run claim. Clean-clone CI `31565278612` then repeated the complete
  security, quality, integration, build and browser gate successfully.
- A fail-closed production preflight now verifies repository bindings and performs optional
  read-only Cloudflare inspection. It confirmed the correct account, isolated empty production
  path, absent `velora-app` and secrets, all 28 migrations pending, both paid gates disabled and the
  required one-webhook Telegram cutover. The production-root routing regression and complete gate
  passed clean-clone CI `31607394871`. No production resource or webhook was changed.
- Documentation links now fail the local and CI gates when a relative target is missing, escapes
  the Velora repository, or has invalid URL encoding. The deterministic Windows/Linux regression
  found and repaired the stale security-review target; the latest complete local gate included
  this check and passed 54 integration tests.
- The production phase-1 runner is locally guarded and regression-tested: it requires the named
  confirmation, completes the full gate plus Telegram/BotHub identity checks before mutation,
  exports the isolated D1, applies migrations, deploys all four secrets with the initial Worker
  version and smoke-tests without calling Telegram `setWebhook`. After explicit authorization it
  exported the empty production D1, applied all 28 migrations and deployed Worker version
  `70e5fb5a-73ae-4b03-99b3-39c04fd17b2f` with all four required secret names. The first HTTP smoke
  observed a transient propagation 404 after the successful deploy; independent retries proved
  root/health/readiness/OpenAPI HTTP 200, D1 `quick_check=ok`, zero foreign-key violations and zero
  users. Hotfix `9fd2e014-197f-4b30-8c3a-75238201f774` now disables scheduled production Telegram
  reconciliation until phase 2 and the runner retries propagation. Production BotHub reconciliation
  is READY; Telegram has no production reconciliation row. Paid AI and payments remain disabled.
  Clean-clone CI `31616327482` independently passed the complete gate for commit `e1079ab` after
  the phase-1 evidence, propagation retry and fail-closed Telegram reconciliation guard were added.
- The phase-2 configurator now verifies the exact default, Russian and English command lists, UTF-8
  descriptions, Mini App button text/URL, webhook URL and allowed update set returned by Telegram.
  A mocked Bot API regression covers both exact success and fail-closed configuration drift. The
  cutover still preserves automatic staging rollback and cannot touch session/BotHub secrets,
  paid gates or migrations. The earlier full quality gate passed 130 unit/regression, 6 roleplay-quality,
  4 contract, 57 integration and 12/12 E2E checks without retries.
- The mandatory post-cutover smoke is exact rather than aggregate: a random bounded owner-only
  `/start` marker traverses the real webhook, only its SHA-256 is audited, and success additionally
  requires a new non-revoked production Mini App session after cutover began. A real Worker+D1
  regression proves a normal user cannot forge the evidence and that the raw marker is not stored.
  Missing either proof within fifteen minutes invokes the existing staging rollback. The first
  live attempts exercised that rollback without leaving Telegram on a partial configuration. On
  2026-08-13 the owner then sent the exact one-time marker and opened Mini App from the new bot
  response; production D1 recorded one marker event and one fresh active session, and the guarded
  runner reached `COMPLETED`.
- The phase-2 runner now also rechecks production `/health`, `/ready` and OpenAPI after deploying
  the exact locally verified Worker and before writing Telegram secrets or moving the webhook.
  Propagation gets bounded retries, and any unhealthy replacement stops fail-closed while staging
  continues receiving updates. The complete local gate passed 131 unit/regression, 6
  roleplay-quality, 4 contract, 60 integration and 12/12 E2E checks without retries; a remote
  read-only preflight again found 28/28 migrations, all four secret names and only the explicitly
  gated Telegram cutover outstanding.
- The owner-authorized phase-2 cutover completed on 2026-08-13. An independent post-run check found
  Telegram webhook `https://velora-app.carreljeremih.workers.dev/telegram/webhook`, zero pending
  updates, no last error and the exact `message,callback_query,pre_checkout_query` update set.
  Production returned `health=ok`, `ready=ready`, `d1=true` and OpenAPI `3.1.0`. This proves the
  Telegram/Cloudflare production path only; paid AI and payments remain independently disabled.

The schedule now records deduplicated operational alerts for dead jobs, failed erasure, repeated
Telegram failures, stuck payments, sampled AI failure rate and budget thresholds. An atomic lease
and severity cooldown prevent concurrent or repeated alert spam. Outbound operational alert
delivery is verified for the confirmed `OWNER_TELEGRAM_ID=1040929628`: the existing staging user
passed live Telegram authentication and is persisted as `OWNER`; the owner confirmed receipt of
the single synthetic alert, and automatic recovery was witnessed without a repeated message.

The protected staging API rejects missing sessions with `401 UNAUTHENTICATED`; generated session,
bot-token and webhook secrets are installed without being exposed. External Bot API configuration
is reconciled and recorded as `READY`; live Mini App `initData` has also been accepted and the
owner role persisted. The synthetic alert/recovery delivery check has passed.

## Verification checkpoint — 2026-08-13

- The owner completed the exact production Telegram smoke: `@aivel0ra_bot` handled the one-time
  `/start velora_smoke_…` marker and returned the production `Open Velora` WebApp button. This
  verifies the Telegram webhook-to-Worker delivery path; it does not by itself verify every Mini
  App screen.
- The new UI master contract is tracked separately in
  `docs/testing/UI_MASTER_CONTRACT_TRACEABILITY.md`. It contains exactly 217 rows for sections
  `0`–`216`; unmapped work remains explicitly `NOT_VERIFIED`.
- The model-catalog work adds stable public model IDs, server-side provider mapping, key-scoped
  capability and per-model smoke gates, a three-request sponsored Free limit, and D1 migration
  `0029_conversation_model_registry.sql`. The catalog selection/save flow passed Android Pixel 7
  and desktop Playwright checks, including scrolling to the save action.
- The complete local quality gate passed secret scan, formatting, documentation links, lint,
  strict typecheck, unit/regression tests, roleplay-quality tests, contract tests, local D1/API
  integration, both builds, and the full Playwright matrix.
- Migration `0029_conversation_model_registry.sql` and the model-catalog build are deployed to
  staging Worker version `a32bfdf2-672b-4e57-bc2c-ac71b7a2cf0d`. Staging health is `ok`, readiness
  is `ready`, D1 is available, BotHub reconciliation is `READY`, and the authenticated key-scoped
  catalog contains both `l3-lunaris-8b` and `mistral-nemo`. Their real bounded evals have not been
  run, so neither candidate is claimed quality-verified or production-ready. Production paid AI,
  sponsored Free AI and payments remain disabled.
- The staging configuration originally shared the production bot while Telegram reconciliation
  was enabled. A staging cron moved the bot webhook to staging before the defect was detected. The
  configuration now locks staging reconciliation to `false`, regression tests enforce this, and
  the production webhook was restored with a rotated secret. Independent Bot API evidence shows
  the exact production URL, zero pending updates and no last error.
- Telegram authentication now shares one in-flight frontend request under React StrictMode. When
  session storage is lost but a valid session cookie remains, the server accepts replay only for a
  separately verified signed Telegram identity matching that session, rotates CSRF, and rejects
  the previous token. Direct replay without the matching session remains `409 INIT_DATA_REPLAYED`.
  The clean first-run/onboarding/catalog/story integration and Android/desktop browser regression
  pass; the full gate passed 134 unit, 6 roleplay-quality, 4 contract, 70 integration and 12 E2E
  tests. A single iPhone tap flake passed on retry, then the conflicting mobile scroll margins were
  corrected and the exact owner scenario passed 3/3 with retries disabled.
- Migration `0030_roleplay_model_admin_controls.sql` adds owner-managed, server-allowlisted model
  presentation/routing overrides, one enabled default and first-token latency telemetry without
  deleting user data. A 232,327-byte staging export was created before migration; staging applied
  exactly `0030` and Worker version `b00d0fc6-a728-44a2-a502-19c0cbf487c3` returned
  `health=ok`, `ready=ready`, `d1=true`. Production was not migrated or redeployed.
- The owner can change a model's display name, Russian description, tier, enabled state, default
  state and bounded fallback chain without a frontend deployment. Provider IDs, prices, context
  limits and the static allowlist are not writable from the UI/API. The backend prevents unknown,
  disabled, self-referential or cyclic fallbacks, disabling the last model, and disabling the
  current default before selecting a replacement; every accepted mutation is audited.
- Model health now reports privacy-bounded 24-hour request count, success/failure rates, average
  completion latency, average time-to-first-token and three recent error codes per model. The full
  mobile panel was manually inspected after an iPhone no-retry E2E run; fields, metrics, fallback
  controls and save actions remain within the viewport.
- Generation fallback now runs the canonical prompt/ContextBudgeter separately for every candidate
  context window and reserves candidate-specific cost. A 128k primary can therefore fall back to
  the 8k Lunaris profile without sending a prompt assembled for the larger model.
- Chat headers expose a compact current-model indicator and availability-filtered Quick Picker. A
  real Worker/D1 regression generated with Balanced, switched the same conversation to Mistral
  without changing existing message IDs, and proved only the subsequent generation used Mistral.
  The Android picker excludes a provider-unavailable model; focused closed/open screenshots were
  manually reviewed.
- The post-change complete gate passed secret scan, formatting, documentation links, lint, strict
  typecheck, 135 unit/regression tests, 6 roleplay-quality tests, 4 contract tests, 71 integration
  tests, both builds and all 12 Android/iPhone/desktop E2E scenarios without retries.
- Migration `0031_mature_discovery_controls.sql` adds explicit server-side Safe Search, a real
  Mature-cover blur preference and privacy-safe AI finish-reason telemetry. Existing users who
  had already enabled Mature content retain that catalogue choice. A fresh staging export was
  created before migration, staging applied exactly `0031`, `quick_check=ok`, and foreign-key
  validation returned no rows.
- Safe Search now changes the SQL discovery filter before results are returned; it is not a CSS
  concealment. Mature imagery receives an actual blur filter and 18+ overlay only when the saved
  preference is enabled. The Worker/D1 regression proves the Mature result disappears and returns
  when Safe Search is toggled, while a rendering regression guards the cover class.
- Assistant-output reporting requires opening a dialog and submitting a reason; account deletion
  retains its warning, typed confirmation, seven-day cancellation and idempotent erasure path.
  A localized root React error boundary now replaces an uncaught render failure with a recovery
  screen rather than a blank page.
- Staging Worker version `11724b96-c5a4-41be-996c-df53dc9b736a` is live. After normal edge
  propagation, `/health`, `/ready`, `/api/health` and `/api/ready` all returned HTTP 200; OpenAPI
  contains both API-prefixed probes. Telegram reconciliation remains disabled and production was
  neither migrated nor redeployed.
- The latest complete gate passed secret scan, formatting, documentation links, lint, strict
  typecheck, 141 unit/regression tests, 6 roleplay-quality tests, 4 contract tests, 72 integration
  tests, both builds and all 12 Android/iPhone/desktop E2E scenarios without retries.
- After the provider-restriction regression and deterministic iPhone selector fix, staging Worker
  version `feb07554-fa58-4c8a-96e0-ef075b24328d` was deployed. `/health`, `/ready`, `/api/health`
  and `/api/ready` all returned HTTP 200; production, its webhook and production D1 were unchanged.
- After the component/filter/creator fixes and the complete 2026-08-14 release gate, staging Worker
  `6ddd97be-6a12-4011-8a1c-606fbdb4e64f` was deployed. All four health/readiness aliases returned
  HTTP 200, and the 48-request read-only SLO baseline completed without a failure. Production and
  the Telegram webhook were unchanged.
- The owner operations dashboard now contains a conservative Cloudflare Free forecast for Worker
  requests, D1 reads/writes, Queue operations and R2 storage/class A/class B operations. The pure
  calculator adds a 35% reserve, exposes warning/critical/exceeded boundaries and hard-codes
  `automaticUpgradeEnabled=false`. The official Workers, D1, Queues and R2 documentation was
  re-checked on 2026-08-14; the runbook requires authoritative Billing/Metrics comparison before a
  human decision.
- The forecast passed two focused unit tests, strict typecheck, focused lint and the real local
  Worker+D1 integration harness. The existing production-like owner journey passed on desktop and
  Android with axe enabled. Both rendered screenshots were manually inspected: the light desktop
  view is readable, and the narrow Android view collapses to one column without horizontal
  overflow. Production, production D1 and the Telegram webhook were not changed.
- The creator E2E now proves one identity-preserving chain instead of combining unrelated objects:
  it creates `Мира` with an approved avatar and complete fields, reloads and verifies persistence,
  creates a Lorebook entry, attaches that exact book to `new-character-1`, opens a private preview,
  publishes the same character, finds it in discovery and starts its normal story. The fixture
  refuses publication unless the attachment was persisted. The scenario passed with zero retries
  on desktop, Android and iPhone and produced no unexplained proxy errors.
- Discovery now uses real server cursor pagination through `useInfiniteQuery`; the E2E proves the
  second request carries the cursor, appends a new card and does not duplicate the first page.
  Catalogue/profile media use lazy loading and asynchronous decoding. The production bundle gate
  passes at 316,499 B initial, 167,068 B authenticated, 186,481 B chat and 13,240 B Lorebook.
- The long-chat acceptance now exercises 500 browser messages: only 80 render initially, one
  expansion renders 160 and leaves 340 hidden, then branch/regenerate/edit and persisted memory are
  exercised after the long history is loaded. Additional focused regressions cover a 1,000-message
  window, 100 Lorebook entries, large manual memory and 120 model choices. Desktop, Android and
  iPhone production-like journeys passed with zero retries after these changes.
- The complete 2026-08-14 gate after the capacity, creator-journey, cursor-pagination and long-chat
  changes passed secret scan, formatting, documentation links, lint, strict typecheck, 174
  unit/regression tests, 6 roleplay-quality tests, 4 contract tests, 72 integration tests, both
  builds, 12/12 full E2E, 3/3 visual and 3/3 accessibility scenarios. The verified bundle was
  deployed only to staging as Worker `6f00b642-b4d3-4a9b-a394-beff556c4746`; staging D1 reported no
  pending migrations. `/health`, `/ready` and the static MiniApp returned HTTP 200, D1 readiness was
  true, and all 48 read-only SLO probes succeeded. Production, production D1 and the Telegram
  webhook were unchanged.
- Prompt Inspector now returns and visibly renders the exact selected model/profile, user persona
  and per-chat instructions in addition to its existing rendered character, memory, active lore and
  selected branch. A canonical `Мира`/`Алекс` acceptance corpus and the real local Worker+D1 chain
  both passed: `{{char}}`/`{{user}}` resolve, a manual fact survives automatic summarization, the
  prior event, triggered lore, style and branch remain present, and the persisted model resolves to
  `deepseek-chat-v3.1`. The production-like desktop E2E expanded and checked these inspector
  sections without retries. No production request or provider credit was used for this evidence.
- The strict post-inspector gate passed with Playwright retries disabled: secret scan, formatting,
  documentation links, lint, strict typecheck, 141 unit/regression tests, 6 roleplay-quality tests,
  4 contract tests, 72 integration tests, both builds and 12/12 Android/iPhone/desktop E2E. The
  exact verified working tree was deployed only to staging as Worker
  `70666b4a-6ca9-4ebe-9bd6-8e853453cd7a`; staging D1 had no pending migrations, `/health`,
  `/ready` and the static MiniApp returned HTTP 200, D1 readiness was true, and all 48 read-only
  SLO probes succeeded. Production, production D1 and the Telegram webhook were unchanged.
- UI reference 28 now has a real three-state chat-sort flow: recent, oldest and most active. The
  most-active query is allowlisted and deterministic in the Worker (visible message count, then
  update time, then ID), and the local D1/API integration proves a 3-message conversation ranks
  ahead of a 1-message conversation. Strict typecheck, lint, 19 focused regressions, 76 integration
  tests and the 2.8-minute iPhone product journey passed. The expected/actual/diff artifacts were
  rebuilt and manually reviewed under `docs/ui/evidence/ui-28`; visual parity remains honestly
  marked `FAIL` because Velora keeps its own approved light/purple shell. Production was unchanged.
- UI references 29–35 now use a D1-backed tri-state tag filter with neutral/include/exclude states,
  usage counts, search, long-name wrapping, independent deep scrolling and sticky controls. The
  Worker applies every included tag, rejects every excluded tag and fails closed on a conflicting
  slug. Focused tests passed 23/23, the full local Worker/D1 integration passed 76/76, and the
  production-like iPhone journey passed 2/2 in 2.8 minutes. Manual review found an initial list
  overlap that automated assertions did not catch; the layout was corrected and the entire browser
  journey was rerun before rebuilding `docs/ui/evidence/ui-29` through `ui-35`. Mobile logic and
  accessibility pass; exact visual parity remains honestly `FAIL`, with tablet/desktop exact-state
  evidence still absent. Production was unchanged.
- UI reference 36 now uses a real D1-backed multi-language catalogue and inclusive discovery
  filtering across an allowlisted Unicode set. The additive `0033` migration preserves the legacy
  column while new reads and writes use `language_code`; Arabic persistence, usage counts,
  multi-language filtering and unknown-code rejection passed the local Worker/D1 chain. Focused
  component tests passed 26/26, integration passed 76/76, and the dedicated production-build flow
  passed 3/3 on Android, iPhone and desktop with accessibility checks. The reviewed iPhone
  expected/actual/diff evidence is stored under `docs/ui/evidence/ui-36`; CJK, Hindi and Arabic RTL
  render without clipping and the list/actions remain usable. Exact reference parity remains
  honestly `FAIL`; production was unchanged.
- UI reference 37 now supports one character, small groups (2–4), medium groups (5–7) and large
  groups (8+) through a real D1-backed catalogue and allowlisted discovery filter. The complete
  filter is hidden when the server-side `groups` feature flag is disabled. Focused component and
  resolver regressions passed, the local Worker/D1 chain proved persistence, counts, filtering and
  unknown-value rejection, and the dedicated production-build flow passed 3/3 on Android, iPhone
  and desktop with accessibility checks. The reviewed iPhone evidence under
  `docs/ui/evidence/ui-37` shows all four options without overlap or clipping. Exact reference
  parity remains honestly `FAIL`; production was unchanged.
- UI references 38–41 now expose backend-configured Free/Plus/Pro cards with D1-derived benefits,
  dynamic fixed periods, one-time Telegram Stars prices, current-plan state and a premium visual
  hierarchy. The mobile comparison stack supports swipe and keyboard focus. Three focused
  `PlanCard` regressions pass, and the complete release E2E passed on iPhone, Android and desktop;
  the iPhone state also passed period/price assertions and an exact-state axe scan. Manual review
  caught and fixed an undefined
  light-theme gradient token and rebuilt expected/actual/diff evidence under `docs/ui/evidence/ui-38`
  through `ui-41`, including the new tablet/desktop pairs. Exact parity remains honestly `FAIL`, and
  production was unchanged.
- UI references 42–46 complete the reviewed pricing-reference set. A native disclosure FAQ now
  documents fixed one-time Stars access, expiry, same-plan day stacking and the non-automatic refund
  path. The period selector renders 365 days only from active D1 packs and updates Plus/Pro prices
  without creating a subscription. The focused iPhone journey passed three consecutive times while
  the final capture pass completed in 4.3 minutes; exact-state axe and manual review passed after
  correcting sticky-header capture positioning and the open-state glyph. Evidence now exists for all
  46 supplied references. Exact visual parity remains honestly `FAIL`; production was unchanged.
- The 16 August 2026 BotHub audit found that the earlier Free candidates were not exposed by the
  production key. The reviewed Free profile IDs now resolve to current key-scoped candidates
  `qwen3-8b` and `gpt-5-nano`; both retain an 800-token application output ceiling and conservative
  fixed-request reserve. Eval evidence was intentionally bumped to V2 so a historical result for a
  different provider model cannot unlock either replacement. Migration
  `0035_current_free_roleplay_models.sql` updates only the owner-editable D1 labels and fallbacks.
  No new paid eval was run, so both routes remain runtime-unavailable until their own confirmed
  BotHub checks complete. Production was read-only audited and was not migrated or redeployed.
- The required contract foundation is now explicit rather than implicit: all 46 controlled
  references remain hash-addressed, every manifest row contains the full mandatory schema, and the
  complete UI/AI/operations specification pack is present. Traceability sections 0–4 and the mobile
  bottom-navigation contract now have named evidence; unresolved typography, spacing, iconography,
  tablet, desktop split-chat, focal-point and R2 upload gaps remain `NOT_VERIFIED` instead of being
  hidden behind the general E2E result.
- The Telegram shell now follows the current Mini Apps event model through strict hooks for
  stable/dynamic viewport height, device and content safe areas, live theme, lifecycle and native
  BackButton. A browser-injected WebApp host now drives each handler: viewport and stable-height
  changes, device/content insets, light/dark theme, activation/deactivation and an independent
  orientation refresh are asserted against the live document. Its native BackButton closes the
  real app drawer and cleans up visibility. A focused active-chat regression proves the same native
  press returns to the conversation list while the duplicate internal arrow is absent; standalone
  fallback remains intact. The fresh iPhone host capture shows the fixed navigation above the
  injected safe bottom with no clipping or horizontal overflow. The keyboard journey now also
  reduces the actual Playwright viewport while emitting Telegram dynamic/stable-height events.
  During that state the open chat becomes the single bounded viewport surface: its complete last
  reply, focused composer and send action remain visible, the draft survives, only the message list
  scrolls, and document height stays bounded. Closing the keyboard restores the normal shell. The
  focused scenario passes on iPhone and Android, and a CSS contract prevents component-level
  `100dvh` regressions. Sections 12, 13 and 15 are independently `VERIFIED`.

- **Exact breakpoint behavior is now executable, not implied.** Five product ranges cover compact
  phones (`320–479`), smartphones (`480–767`), portrait tablets (`768–1023`), landscape
  tablets/laptops (`1024–1439`) and bounded desktop (`1440+`). A production-build browser journey
  traverses `320`, `360`, `600`, `820`, `1100`, `1280`, `1440` and `1800px`, proving exact card
  density, drawer and filter-sheet geometry, plus absence of document-level horizontal overflow.
  Fresh captures at 320/820/1280/1440/1800 were manually inspected; the compact exception stays
  readable and desktop stops at five columns, then six on very wide screens. Section 16 is
  independently `VERIFIED`. The final no-retry release gate also exposed a sticky-header/smooth-
  scroll obstruction in the character-editor Back journey; the regression now restores the real
  visible control position before the tap and passes on iPhone, Android and desktop. The complete
  gate passed 216 unit/regression, 7 roleplay-quality, 4 contract, 86 integration and 15/15 E2E
  scenarios without retries.
- **Section 17 desktop chat is independently `VERIFIED`.** At `1024px+` the production UI now uses
  three bounded zones: a `260–300px` conversation rail with an `aria-current` active row, a central
  chat surface capped at `900px`, and a `260–320px` inspector that mounts the real Lore, Memory,
  Prompt and Settings panels. The inspector has a named close action and Escape handling; Telegram
  keyboard mode collapses both side zones, while the existing mobile single-chat behavior remains
  intact. Production-build geometry, horizontal-overflow and axe checks pass on desktop, and the
  reviewed evidence is retained at
  `docs/ui/evidence/contract-17-desktop-chat/actual.png` (SHA-256
  `00BC9B8E026894AC4C090159055BDA57A4E911834B516B6AAD59D8051BECAFFD`). The final run also caught
  and fixed three real regressions: the Windows local-Wrangler D1 transport race now waits for a
  stable health barrier without retrying paid or mutating requests; character reporting cannot race
  an unsettled review mutation; and mobile/desktop settings assert their actual scroll owners. The
  clean gate passed 217 unit/regression, 7 roleplay-quality, 4 contract, 87 integration and 15/15
  iPhone, Android and desktop E2E scenarios without retries. Production remained unchanged; only
  `wrangler deploy --dry-run` was executed.
- **Section 18 character images is independently `VERIFIED`.** Character avatars now persist a
  bounded horizontal and vertical focal point and render through one failure-safe cover component
  across discovery, profiles, conversations and the editor. The editor reads intrinsic dimensions,
  identifies portrait, landscape and extreme ratios, exposes two labelled crop controls and keeps
  invalid or failed images on a stable fallback. The additive D1 migration, strict domain bounds and
  Worker projections are covered through create, edit, discovery, conversation and duplicate
  journeys. A production-build iPhone flow selected a `1600 x 900` image, saved focal values
  `23 / 77`, passed axe and completed without retries. The directly inspected evidence is retained
  at `docs/ui/evidence/contract-18-character-images/actual.png` (SHA-256
  `8274F132EEF012F533664FD6900E27FF12AF29606864147B405C18D4B74189B9`). Production remained
  unchanged. The clean release gate passed 222 unit/regression, 7 roleplay-quality, 4 contract,
  89 integration and all 15/15 iPhone, Android and desktop E2E scenarios without retries.
- The radius system is now executable instead of descriptive: all component declarations use one of
  eight semantic tokens (`xs`, `sm`, `md`, `lg`, `xl`, `card`, `dialog`, `pill`), with only true
  circles, inherited corners and square geometry exempt. A dedicated integration regression rejects
  new literal pixel/rem radii. The fresh production-build iPhone journey passed 1/1 in 4.8 minutes,
  the subsequent complete release gate passed all 15/15 iPhone, Android and desktop scenarios, and
  manual review of discovery, dialogs, chat cards, filter sheets and pricing found no radius-induced
  clipping or overlap. Section 9 is now independently `VERIFIED`; typography, spacing and
  iconography remain honestly open.
- Iconography now has one executable source: pinned `lucide-react@1.31.0`, a typed semantic
  `VeloraIcon` registry for product surfaces, and direct imports from the same set in the initial
  shell to preserve lazy chunk boundaries. Raw inline SVG and Unicode icon glyphs were removed from
  production call sites; icon-only controls retain accessible parent labels and approximately 44px
  hit targets. The regression suite locks the package version, registry shape, SVG ownership and
  raw-glyph prohibition. Fresh iPhone discovery, filter, profile, pricing and FAQ captures showed no
  icon clipping, overlap or mixed visual language. The complete gate passed 209 unit/regression, 7
  roleplay-quality, 4 contract, 80 integration and 15/15 iPhone, Android and desktop E2E scenarios.
  Three stale glyph-based E2E locators and one ambiguous `Saved` locator were corrected to assert
  accessible semantics. Repeated standalone Mobile WebKit runs again showed local resource
  degradation, while the isolated release gate passed the complete iPhone journey without retries.
  Section 10 is independently `VERIFIED`.
- Typography is now deterministic and executable. Pinned local Noto Sans and Noto Serif `5.3.0`
  assets cover Cyrillic and Latin normal/italic text without relying on installed device fonts or a
  network CDN. All eleven required typography families define size, weight, line-height and
  letter-spacing, and more than 100 component sizes reference semantic tokens instead of literal
  px/rem values or numeric font shorthands. Fresh iPhone discovery, editor, chat, model and pricing
  captures showed stable Cyrillic/Latin rendering, natural wrapping and no clipping.
- Component spacing now uses only the canonical `2/4/6/8/12/16/20/24/32/40/48/64` scale; larger
  navigation and hero clearances are named compositions of that scale. A regression inspects more
  than 500 margin, padding and gap declarations and rejects literal px/rem spacing, including the
  retired random `13px`, `17px` and `21px` values. Android visual review caught one unrelated legacy
  duplicate Premium badge in the model picker; the duplicate was removed and covered by the shared
  component suite. The final gate passed 209 unit/regression, 7 roleplay-quality, 4 contract, 82
  integration and all 15/15 iPhone, Android and desktop E2E scenarios without retries. Sections 7
  and 8 are independently `VERIFIED`; exact 46-frame parity remains honestly open.
- The color system is now measured and executable. `toolkit/measure-reference-palette.mjs` hashes
  all 46 controlled screenshots and samples exactly 728,160 pixels; the resulting near-black,
  dark-neutral and saturated-action direction is normalized into Velora's own semantic purple
  identity rather than copied literally. Twenty required roles cover backgrounds, surfaces, text,
  brand states, roleplay actions, Premium, status, borders and elevation. Dark, light and AMOLED
  change token values instead of patching individual components. A dedicated integration policy
  locks the reference count, hashes, sample total, `sharp@0.35.2` and token set, and rejects direct
  component hex/RGB/named-color literals. The production-build iPhone journey now saves each theme,
  checks its exact computed root background and emits three full-page captures. Manual review found
  readable text, controls, cards, borders and destructive actions with no color-induced clipping or
  missing content. Section 6 is independently `VERIFIED`; production remained unchanged.
- The core-component contract is now executable rather than a naming checklist. All 48 required
  names are exact production exports and are mounted by live surfaces; a new integration policy
  rejects exported-only placeholders and retired JSX aliases. Shared boundaries now cover the
  shell, discovery, characters, personas, forms, chat, models, memory, lore, billing, overlays and
  states. `MemoryVersionList` reads real history and restores through the idempotent Worker route;
  the fresh production-build iPhone journey completed the restore, verified the old value, saved
  the desired value again and continued through the remaining flow. The 6.5-minute journey passed
  1/1 with no serious or critical accessibility violation. Fresh discovery, lorebook, long-chat,
  model, pricing and light-theme captures were manually reviewed with no horizontal overflow or
  component overlap. The complete gate then passed 216 unit/regression, 7 roleplay-quality, 4
  contract, 84 integration and 15/15 iPhone, Android and desktop E2E scenarios without retries.
  Section 11 is independently `VERIFIED`; production remained unchanged.

## Deliberately blocked

- **Sections 28 and 29 are independently `VERIFIED`.** Generation never resends an unbounded
  conversation merely because a provider advertises a huge window. The Worker assembles the
  ordered platform, character, creator, persona, persistent-memory, relevant-lore and chat layers,
  then keeps the newest active message branch within a per-candidate budget. The normal working
  context is capped at 32,000 tokens (inside the required 24k–48k target), reserves the configured
  output allowance, and is rebuilt for every smaller fallback window. Unit, mechanical
  traceability and Worker integration cover oldest-history trimming, exact prompt precedence,
  activated lore, the latest user message, the 32k cap and the 8,192→7,392 fallback rebudget.
- **Section 30 is independently `VERIFIED`.** Response length now has the required four localized
  presets: Short, Regular, Detailed and Long RP. Their 400/800/1,600/8,192-token ceilings live in
  one typed Worker registry rather than React constants, and the effective provider request is
  still clamped by the selected model and per-conversation maximum. Additive migration 0037
  preserves every existing setting while extending the D1 constraint with `DETAILED`; the clean
  migration, strict schema, runtime registry, Worker route and production-build settings journey
  are covered by regression, integration and browser tests.
- **Sections 31 and 32 are independently `VERIFIED`.** Provider chunks are emitted as SSE deltas
  and accumulated in Worker memory; no per-token or per-chunk D1 write exists. One streaming row is
  finalized into one assistant message together with usage, while the browser incrementally updates
  that same bubble. User-message keys are unique per user/operation and generation keys per
  conversation; the generation lock prevents concurrent paid work and a losing reservation is
  refunded before any provider call. Worker integration proves a repeated message returns the same
  row, a repeated generation produces no additional provider attempt, and the completed branch has
  exactly one final assistant response.
- **Sections 33 and 34 are independently `VERIFIED`.** Immutable migration 0038 extends every
  message with content format, greeting/edit flags, origin and an updated timestamp, normalizes the
  internal role to `INTERNAL`, and gives soft-deleted rows the explicit `DELETED` lifecycle state.
  The migration copies every legacy row before replacing the constrained table and restores both
  indexes; a clean D1 run finishes with `quick_check=ok` and no foreign-key violation. A selected
  character-version greeting becomes the first normal assistant message with
  `isGreeting=true`, Markdown format and `CHARACTER_GREETING` origin, while the source character
  version is left unchanged. Worker integration covers alternate-greeting rendering, generation,
  user edits and deletion provenance.
- **Section 35 is independently `VERIFIED`.** A greeting bubble has a dedicated three-action menu:
  copy, conversation-only edit and greeting regeneration. Editing creates an immutable root
  `USER_EDIT` override, while the server-only `GREETING` generation mode accepts only a completed
  greeting and stores the result as another root greeting variant. Worker+D1+mock-BotHub integration
  proves three selectable variants, exact billing and an unchanged public character `firstMessage`;
  the production build executes the menu and edit flow on iPhone, Android and desktop.
- **Sections 36–38 are independently `VERIFIED`.** Message menus now measure their real trigger and
  contents, clamp both axes to viewport gutters, anchor above/below on desktop and switch to a
  bounded mobile bottom sheet only when neither anchored side fits. Resize and nested chat scrolling
  recalculate placement. The assistant menu exposes the full copy/edit/regenerate/continue/branch/
  rate/report/delete set with Delete last; the user menu remains exactly copy/edit/branch/delete.
  Pure geometry regressions cover anchored and sheet modes, while the production browser checks the
  real menu rectangle against the viewport and executes role-specific actions.
- **Sections 39–42 are independently `VERIFIED`.** Assistant and user edits are immutable sibling
  versions: the source row remains available, the selected override becomes the active context, and
  editing an assistant response never invokes the provider. A user message with descendants now
  shows the exact branch-creation warning before Save, while both the original and edited branches
  remain restorable. Regeneration creates a distinct assistant sibling in the same generation group;
  continuation creates an assistant child and injects its instruction only into the server-built
  provider prompt, without a fake visible user message. Worker+D1+mock-BotHub integration proves all
  four data paths, and the production-build browser journey covers the edit warning, regeneration
  and variant UI.
- **Sections 43–49 are independently `VERIFIED`.** Migration 0039 preserves every conversation
  pointer while naming the selected graph leaf explicitly as `active_leaf_message_id`; context still
  walks `parent_message_id`, and recursive soft deletion hides the removed branch, restores its
  nearest surviving parent and visibly invalidates memory. Public greetings, character descriptions,
  chat, edit preview and creator preview now all use the same sanitized `SafeMarkdown` boundary.
  Roleplay emphasis is semantic and cyan-accented, while GFM covers strong/triple emphasis, strike,
  quotes, lists, inline/fenced code and safe links. Partial streams receive temporary closing
  delimiters only for rendering, never persistence. XSS tests reject script, iframe, event handlers
  and javascript/data/vbscript URLs. Clean D1, Worker integration and the production desktop journey
  pass with the renamed leaf and canonical renderer.
- **Sections 50–57 are independently `VERIFIED`.** The documented non-evaluating template engine
  now has the exact contract corpus, including unknown and malformed tokens, literal braces,
  Unicode, emoji, Russian, one hundred occurrences, nested expansion and cycle termination.
  `{{char}}` comes from the immutable character version attached to the conversation. `{{user}}`
  now consistently prefers the active Persona and falls back to the product-profile display name
  in both greetings and generation prompts; this fixed a real split where no-Persona generation
  previously used the generic `User`. Every character, Persona, Lorebook, memory and chat
  instruction layer is rendered and visible in Prompt Inspector. The typed Drizzle schema no
  longer claims that character versions use the obsolete `definition_json`; it matches the actual
  normalized immutable columns. Worker+D1 integration creates a conversation on version 2,
  advances the character to version 3 and proves the existing chat retains its original greeting
  and Persona snapshot.
- **Sections 58–66 are independently `VERIFIED`.** Conversation settings now persist narrative
  style, POV, pacing and preferences, while the selected response-length preset contributes both a
  hard server-owned output ceiling and an explicit `CHAT_INSTRUCTIONS` directive. The prompt
  regression locks the required order from platform safety through the latest active-branch user
  message. Migration 0040 separates pinned `manual_context` from `auto_summary`, renames the active
  version/source fields to the canonical contract names and adds provider metadata. Because the
  legacy combined field cannot be separated reliably, migration preserves it losslessly as pinned
  manual context instead of risking silent deletion. Real Worker+D1 integration adds, removes and
  rewrites manual facts, preserves them across incremental and full regeneration, advances only the
  automatic-summary cursor and rebuilds a 1,200-message branch. The production-build iPhone journey
  saves, restores and summarizes through the visible `Память разговора` workspace. It also exposed
  and fixed a real flex overlap where the mobile message list painted over the memory editor; the
  final viewport and isolated-panel captures are readable, horizontally contained and free of
  message/composer overlap.

- **Sections 67–72 and 74–79 are independently `VERIFIED`; section 73 remains explicitly open.**
  Automatic summaries now carry the complete retention/anti-invention contract, queue only after
  20 unsummarized messages or 12,000 characters, and retain the exact invalidating message through
  migration 0041. Full regeneration first returns a read-only Current/Generated comparison;
  applying it rebuilds a 1,201-message active branch without changing pinned manual context, while
  restoring an older snapshot also requires preview and creates a new immutable version. Lore
  activation remains Unicode-aware and budgeted by priority/position, and the visible inspector now
  reports the actual triggering keys, priority and token estimate used by generation. The requested
  `DeepSeek V4 Flash` memory model was not found in the currently verified BotHub API catalogue, so
  Velora truthfully keeps its tested no-cost deterministic fallback instead of silently spending
  CAPS or claiming an unavailable provider model. Section 73 therefore remains `NOT_VERIFIED` until
  an available economical provider model is explicitly validated and enabled behind a paid-memory
  gate.

- Section 19 now has a complete local binary image pipeline: the browser validates JPEG/PNG/WebP,
  crops around the chosen focal point, resizes to at most 1600px and compresses to WebP (or JPEG
  when WebKit cannot encode WebP) without base64. The Worker independently checks declared and
  actual MIME, byte size and geometry,
  generates the R2 key without trusting the filename, and stores only metadata in D1. Local
  Worker+D1+R2 integration proves byte-identical put/get with ETag, MIME-spoof rejection, explicit
  deletion and scheduled account-erasure cleanup; production-build iPhone, Android and desktop
  browsers prove the real PNG→canvas→compressed-upload→avatar-selection flow. Strict typecheck,
  lint, 26 focused tests and the full Worker integration pass. Live R2 remains honestly unverified because the authenticated account
  returns Cloudflare API code `10042` until R2 is enabled; no production resource was created.

- paid roleplay inference passed the deliberately bounded V3 checkpoint and is enabled only on
  staging; production remains disabled pending separate owner approval and live staging evidence;
- R2 is not enabled on the account, so the initial free design uses Telegram `file_id` storage;
- paid AI and real Stars operations remain separately gated; the production Telegram webhook is
  active, but neither gate was enabled by the cutover.

No missing feature is reported as complete. A new mechanically checked traceability matrix now has
exactly one row for every numbered master-brief section `0`–`216` and explicitly retains the
production Telegram, live Stars, R2/full-media and post-launch evidence gaps. The latest complete
local evidence set passed secret scan, formatting, documentation links, lint, strict typecheck, 277
unit/regression tests, 7 roleplay-quality tests, 5 contract tests, 107 integration tests, both builds
and all 15 E2E scenarios without retries. The same final tree also passed the focused visual set 3/3
and accessibility set 6/6. Repeated multi-project Playwright invocations initially exposed a local
Mobile WebKit resource-degradation timeout; the release gate now runs each device in a fresh process
and the final complete gate passes reproducibly without removing assertions, adding retries or
raising the bounded test timeout. The gate holds an exclusive local lock, preventing concurrent
runs from racing over integration and browser output directories. The verified tree was deployed
to production as Worker version `3404cf11-b111-4fe6-aa1d-712dd0a5ec59`; `/health`, `/ready` and
OpenAPI 3.1 smokes passed, no Telegram webhook mutation was made, and paid AI, sponsored AI and
payments remain disabled. Discovery, conversation history, characters, personas, model catalogue,
memory, Lorebooks and billing now share localized accessible skeleton states; decorative rows are
hidden from assistive technology and their shimmer is disabled by reduced-motion preferences.
Dialogs now trap and restore focus, empty workspaces expose relevant recovery actions, and safe
localized infrastructure errors cover network, server, Telegram auth, AI provider, media, D1
capacity, rate-limit and payment failures. Visual checkpoints fail on rendered debug/template
artifacts, raw Markdown, broken visible images, unexpected console/page errors and unexpected
network failures. The
pre-update D1 export is
`toolkit/backups/velora-production-pre-update-20260821T014521Z.sql`; post-deploy remote integrity is
`quick_check=ok`, zero foreign-key rows and 43 applied migrations. The first live five-minute Cron
refresh persisted runtime status `OK` at `2026-08-21 01:50:38 UTC` with `core_chat_enabled=1`. The
live production stylesheet also contains the released skeleton, empty-state and scoped-motion
contracts.

## 2026-08-21 owner AI usage and visual-evidence production update

- Owner-only operations now expose privacy-safe D1 aggregates for the last 24 hours, seven days
  and lifetime, plus the seven-day per-model split and configured budget remainder. Admin responses
  explicitly receive `ownerAiUsage: null`.
- The BotHub CAPS balance is not fabricated: the UI reports that the exact value is available only
  in BotHub because the documented provider API has no balance endpoint.
- All 46 controlled references have non-empty `expected`, `actual` and `diff` files (138 artifacts),
  enforced by regression test. Visual parity remains explicitly unapproved where the reviewed diff
  differs materially from the canonical reference.
- Current-tree evidence: secret scan, formatting, docs, lint, strict typecheck, 277 unit/regression,
  7 roleplay-quality, 5 contract, 107 integration, both builds and 15/15 E2E scenarios passed. The
  initial JavaScript stayed inside its guard at 349,492 bytes.
- `docs/ai/FINAL_AI_REPORT.md` records the selected routes, current official BotHub RUB prices,
  provider versus product limits, real eval state, bounded fallback, deterministic memory and
  fail-closed CAPS strategy without inventing an unavailable provider balance.
- The authenticated shell now exposes the user's actual plan and credit balance as the billing
  action and no longer presents infrastructure deployment wording as a user-facing plan.
- Production Worker version `6b8c010f-d03e-43f1-8da7-08773fa90106` is live. Health, readiness,
  OpenAPI 3.1 and the emitted JS/CSS chain returned HTTP 200. Remote D1 remains at 43 migrations
  with `quick_check=ok` and no foreign-key violations. Paid AI, sponsored AI and payments remain
  disabled; this deploy did not mutate the Telegram webhook.

## 2026-08-21 Telegram Web App cache-bust hotfix

- The production assets already contained the new plan/credit header, but Telegram could retain the
  previous Mini App instance because the persistent menu and reply button reused the same URL.
- Every bot Web App URL now receives the server-owned cache version `20260821-2`. `/start` and `/app`
  reply immediately with that URL and schedule an idempotent reconciliation of Telegram's persistent
  menu button; the scheduled production reconciler remains disabled.
- The focused URL/configuration/webhook/preflight/traceability suite passed 48/48. Production
  `/health`, `/ready`, `/openapi.json` and `/` returned HTTP 200 after deployment.
- Worker version `c2df135a-6335-4297-927f-36d813ef386f` is deployed. Direct inspection of the emitted
  entry and authenticated application chunks confirms that the obsolete `CLOUDFLARE FREE` header
  marker is absent. A fresh real-Telegram `/start` or `/app` open remains the required human proof of
  the new WebView cache key and persistent-menu reconciliation.

## 2026-08-23 BotAvatar roleplay and model-menu production release

- Production D1 migrations `0052`–`0054` are applied. Remote evidence is
  `quick_check=ok`, 54 recorded migrations, the `character_bot_group_events.assistant_body`
  column is present, and all three new owner-editable model override rows exist.
- AI-avatar prompts now include the complete immutable character definition, a first-message voice
  exemplar, alternating user/assistant history, scene/action requirements and an explicit ban on
  controlling the user's character. Focused roleplay and webhook regression tests passed 14/14,
  followed by lint and strict TypeScript checks.
- Only a Pro owner can change an AI-avatar model. The menu has an explicit `Закрыть` action and GPT
  routes are absent. Runtime selection remains the intersection of the reviewed registry, the
  key-scoped BotHub catalogue and a completed provider smoke.
- A production-only regression was found after release: the cached BotHub catalogue still contained
  retired GPT IDs, and the parser invalidated the complete row. That reduced the AI-avatar model
  menu to `Закрыть` and left the avatar without a generation route. The parser now discards unknown
  legacy IDs individually while retaining reviewed IDs. The exact stale-cache case has a regression
  test; malformed JSON still fails closed.
- Worker version `44d9a888-1068-4e66-b1b6-e3259306b5a1` is live at
  `https://velora-app.carreljeremih.workers.dev`. `/health`, `/ready`, `/openapi.json` and `/` return
  HTTP 200, and `/` references the current `index-CSJ98K4j.js` asset.
- Main bot and Alice webhook URLs both point at this production Worker, both report zero pending
  updates and no last Telegram error. A real private `/info` webhook smoke and one bounded private
  Alice AI generation smoke both returned `processed`. Qwen/Kimi remain hidden because their latest
  provider smokes failed; no unavailable model is presented as working.

## 2026-08-24 AvatarBot per-user isolation, Lorebook and group-trigger release

- Migration `0059_avatar_bot_user_model_preferences.sql` isolates model selection by
  `(avatar_bot_id, telegram_user_id)`. Production D1 reports `quick_check=ok`, zero foreign-key
  violations, 59 recorded migrations, zero persisted per-user overrides after the forced reset and
  one active AvatarBot on `velora-free-roleplay`. A Free user cannot inherit or select a paid model;
  every paid preference is checked against the interacting user's current MainBot plan at request
  time.
- AvatarBots answer group messages only when the message replies to that bot or contains the exact
  Telegram `mention` entity for its username. Plain links and mentions of other users do not
  trigger generation. Private chats continue to respond normally.
- Enabled Lorebook entries attached to a character are now force-included in every normal MainBot
  and AvatarBot roleplay generation, bounded by the plan's Lorebook token budget. Trigger-key
  matching remains available for diagnostics. Alice's enabled 400-token entry fits every current
  plan budget.
- During AvatarBot inference Telegram `typing` is refreshed every four seconds. Private chats also
  receive best-effort ephemeral Bot API drafts and are finalized by the ordinary persisted message;
  groups use typing only because Telegram drafts are private-chat-only. Draft or typing failures do
  not discard the final generated response.
- Current-tree quality evidence: secret scan, Prettier, documentation links, ESLint, strict
  TypeScript, 324 unit/regression tests, 7 roleplay-quality tests, 5 API-contract tests, 124
  integration tests, Worker/web builds and 20/20 Playwright scenarios across iPhone, Android,
  tablet and desktop all passed without retries.
- Production Worker version `a49a7268-fd9f-40a7-b145-e47696ed36f5` was deployed with the current web
  assets. `/health` returned `ok`; `/ready` returned `ready` with D1 available. The production model
  verifier confirms both economical Free routes and `velora-deepseek-v3-0324` are visible and
  available. MainBot and Alice webhooks both point to this Worker with zero pending updates and no
  Telegram-reported error.
- The complete 46-reference human visual approval matrix remains open. Automated viewport and
  accessibility evidence is green, but this report does not substitute that evidence for final
  human device approval.

## 2026-08-25 current-tree UI and model-goal verification

- The economical Free catalogue remains `mistral-nemo` plus the roleplay-oriented
  `l3-lunaris-8b`; both retain bounded provider evidence, plan enforcement and explicit budget
  guards. Unstable catalogue-only routes remain hidden.
- The latest compact-card calibration uses semantic typography and spacing tokens and preserves the
  42 px minimum action target. The integration contracts caught and prevented a temporary 38 px
  regression rather than weakening the requirement.
- ESLint, Prettier, strict TypeScript, secret scan, Worker/web build, 332 unit/regression tests and
  all 126 integration tests pass. Local D1 migration/integrity, Worker API integration and load
  smoke also pass through the authenticated Wrangler OAuth session.
- The complete stateful `@visual @a11y` journey passes without retries on iPhone, Android, tablet
  and desktop. Fresh phone/tablet/desktop evidence and diffs are stored for all 46 states; focused
  Unicode, CJK, RTL and group-size filter journeys also pass on every canonical viewport.
- Exact reference parity remains deliberately recorded as `FAIL` until human visual approval. The
  automated evidence proves responsive behavior, functionality and accessibility, not subjective
  pixel-level acceptance.

## 2026-08-26 action-menu and chat-reaction regression verification

- Character-card action menus and the chat-header reaction picker now render through viewport-level
  portals instead of inside cards or chat containers that clip overflowing content.
- Placement is calculated from the trigger geometry, clamped to the visual viewport and moved above
  the trigger when there is not enough room below. Outside click and Escape both close the menu.
- Regression coverage checks portal ownership and viewport bounds for the compact discovery card and
  the chat-header reaction picker.
- Secret scan, Prettier, documentation links, ESLint, strict TypeScript, 338 unit/regression tests,
  7 roleplay-quality tests, 5 API-contract tests, 126 integration tests, Worker/web builds and all
  20 Playwright scenarios across iPhone, Android, tablet and desktop passed.
- This fix is verified in the local production build but has not been deployed in this change.

## 2026-08-26 owner Everlasting Summer Lorebook repair

- The existing private `Бесконечное Лето` Lorebook owned by Telegram user `1040929628`
  (`@odinnadsat`) was confirmed to contain zero entries before the repair.
- The supplied 89,723-byte source was normalized into eight bounded thematic entries with deduplicated
  activation keys, explicit priorities and token budgets within the production schemas.
- Production D1 verification confirms eight enabled entries, eight valid JSON key sets and content
  lengths between 571 and 875 characters. The existing enabled attachment to character
  `alice-dvachevskaya` remains intact.
- The pre-change record is stored under `backups/production-updates`, and the production seed is
  idempotent through stable entry identifiers and `INSERT OR IGNORE`.

## 2026-08-26 Lena Tikhonova character and AvatarBot provisioning

- Production now contains the published, public, SAFE character `lena-tikhonova`, owned by the
  verified owner account for Telegram user `1040929628` (`@odinnadsat`). The character includes the
  requested greeting, structured persona fields, roleplay instructions and dialogue examples.
- The supplied 640 x 640 PNG is stored as an approved Telegram-backed image and is used by both the
  character and the Telegram profile of `@lenaneyrobot`.
- The private `Лор Лены` Lorebook contains ten enabled entries with valid activation-key JSON. Both
  `Лор Лены` and the existing `Бесконечное Лето` Lorebook are enabled for the character.
- AvatarBot `a17415e8-b8a6-496d-a6ac-c6e0d3f1b75f` is active as `@lenaneyrobot`. Telegram confirms
  its production webhook, six commands, one profile photo, zero pending updates and no webhook
  error. A bounded private `/info` webhook smoke returned `processed`.
- The child-bot token remains encrypted outside Git with Windows DPAPI at rest and AES-256-GCM in
  D1. The temporary SQL transport file was removed immediately after the successful production
  import; the pre-change production snapshot is retained under `backups/production-updates`.
- The complete current-tree quality gate passed after provisioning: secret scan, Prettier,
  documentation checks, ESLint, strict TypeScript, unit, roleplay-quality, API-contract and
  integration tests, Worker/web builds, and the full Playwright suite across iPhone, Android,
  tablet and desktop. Playwright's final run record reports `passed` with no failed tests.

## 2026-08-26 Katya / Cold Embrace completion and production release

- The Cold Embrace source audit covers 23 Ren'Py files, 166,795 source lines, 15,678 dialogue
  statements, 652 labels and 520 Katya dialogue statements. The resulting production content has
  40 world Lorebook entries and 12 Katya-specific entries, covering 32 significant named or
  functional cast roles and 17 verified story/location coverage sections.
- Katya is published with six dialogue examples and six alternate greetings in addition to the
  base greeting. Her structured persona and speaking style were derived from the mod dialogue;
  no unverified surname was invented.
- The 1,254 x 1,254 portrait was composed from the supplied Cold Embrace sprite references and
  preserves Katya's aquamarine-blue hair and visual identity. The verifier confirms a 1,961,535
  byte PNG attached to the character.
- Lore activation in AvatarBots now uses the current message plus recent user/assistant context
  instead of force-selecting a fixed priority prefix. This keeps Katya's core persona active while
  allowing relevant places, events and secondary characters to enter the bounded prompt.
- AvatarBot Markdown is safely escaped to Telegram HTML. Single-asterisk roleplay actions,
  including multiline actions, render as `<i>italic</i>`; ordinary dialogue remains plain and no
  `<b>` conversion is introduced. Both final messages and live drafts use the same formatter.
- `@katyaneyobot` is confirmed by Telegram with commands `start`, `help`, `info`, `memory`,
  `model` and `clear`; its webhook is configured, pending updates are zero, the last webhook error
  is null and the owner chat is reachable.
- Production Worker version `249aab63-d2de-4298-879b-ac80c6586447` was deployed after secret scan,
  Prettier, documentation checks, ESLint, strict TypeScript, 343 unit tests, seven roleplay-quality
  tests, five API-contract tests, 126 integration tests, local D1/load checks, Worker/web builds and
  20 Playwright scenarios across iPhone, Android, tablet and desktop. The release record confirms
  health, readiness, OpenAPI and D1 integrity as `PASS` with all 61 migrations present. Telegram's
  webhook configuration was not changed by the deployment.

## 2026-08-27 AvatarBot and MainBot provider-outage recovery

- Production request evidence for `@lenaneyrobot` showed two failed `l3-lunaris-8b` requests at
  13:41:47 and 13:42:10 UTC with `BOTHUB_UPSTREAM_UNAVAILABLE`. The former AvatarBot path made one
  provider attempt and then returned the generic Telegram error shown by the user.
- AvatarBot generation and response-variant regeneration now use the same bounded recovery policy:
  retry the selected model once, then use up to two distinct, enabled and tariff-authorized fallback
  models. A fallback is allowed only before any output is emitted, preventing duplicate partial
  replies. Exact terminal error codes are persisted on both the request and AvatarBot state.
- MainBot no longer bypasses the server model registry for `velora-balanced`; it now receives the
  reviewed fallback chain too. The effective graph is acyclic: Balanced -> DeepSeek V3 0324 ->
  Free Context, while Free Roleplay -> Free Context. No fallback elevates a user's tariff access.
- Regression tests reproduce the production outage twice and prove successful recovery through
  `mistral-nemo`, prove that partial output is never retried, and verify provider allowlist and tariff
  isolation. The API integration suite also proves the MainBot sequence Balanced, Balanced retry,
  DeepSeek V3 0324.
- The final release gate passed secret scan, Prettier, documentation checks, ESLint, strict
  TypeScript, 357 unit/regression tests, seven roleplay-quality tests, five API-contract tests,
  126 integration tests, local D1/load checks, Worker/web builds and all 20 Playwright scenarios on
  iPhone, Android, tablet and desktop.
- A pre-update D1 export is stored at
  `backups/production-updates/velora-production-pre-update-20260827T005828Z.sql`. Migrations 0062
  through 0066 were applied, and Production now reports 66 migrations with D1 integrity passing.
- Production Worker version `807fa481-7e5c-4eab-93f2-9d8cadd02c9a` is deployed. `/health`, `/ready`,
  OpenAPI and D1 integrity all pass. The release evidence is
  `backups/production-updates/release-20260827T005828Z.json`; Telegram webhook configuration was not
  changed.
