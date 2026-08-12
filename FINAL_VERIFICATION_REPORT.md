# Velora verification report

Updated: 2026-08-12.

Velora is **not production-ready**. The isolated foundation and staging MVP for Telegram auth,
personas, versioned characters, discovery interactions, image media, branching conversations, lorebooks,
advanced roleplay templates/settings, prepaid streaming generation and the disabled-by-default one-time Stars payment contour are
verified; the full product from the master brief is still in progress.

## Verified evidence

- isolated workspace and Git repository; RoleMate was not modified;
- private GitHub repository `Jeremih333/velora` with a clean-clone CI gate covering portable secret
  scanning, formatting, lint, strict typecheck, unit/integration tests, build and responsive E2E;
- the root owner README now documents requirements, installation, local development, environment
  separation, D1/R2/Workers, BotFather/Telegram, BotHub, migrations, deployment, tests,
  backup/restore and the explicit production gates from zero without embedding secrets;
- Cloudflare Free-only architecture with no card or automatic plan upgrade;
- separate `velora-staging` and `velora-production` D1 databases;
- production D1 is intentionally unmigrated; staging currently has 66 schema tables;
- staging D1 migrations 0001-0028 passed; `quick_check` returned `ok` and
  `foreign_key_check` returned no violations;
- pre-0003, pre-0004, pre-0005, pre-0006, pre-0007, pre-0008 and pre-0009 staging backups were exported before their migrations;
- staging Worker version `b57438ee-0283-4ccc-b752-69c440c6a6bf` is live with a five-minute
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
- 24 reviewed Linux pixel baselines cover onboarding, search, character, creator, chat, memory,
  lorebook and settings across Android, iPhone and desktop; the review fixed host-preference theme
  leakage, WebKit native-control contrast and mobile navigation overlap, with semantic theme and
  composer-geometry regressions alongside the screenshots;
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

## Deliberately blocked

- paid roleplay inference passed the deliberately bounded V3 checkpoint and is enabled only on
  staging; production remains disabled pending separate owner approval and live staging evidence;
- R2 is not enabled on the account, so the initial free design uses Telegram `file_id` storage;
- production deploy remains gated until the live integrations and their tests pass.

No missing feature is reported as complete. The latest complete local gate passed secret scan,
formatting, lint, strict typecheck, 129 unit/regression tests, 6 roleplay-quality tests, 4 contract
tests, 28 integration tests, both builds and 9/9 E2E cases without retries.
