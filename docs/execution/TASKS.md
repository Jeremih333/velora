# Tasks

## Milestone 0 — VERIFIED

- [x] Establish an isolated Velora workspace and toolkit boundary.
- [x] Read the full master brief and current official external constraints.
- [x] Create the durable documentation/ADR hierarchy.
- [x] Define Free Cloudflare and one-time prepaid AI strategy.
- [x] Scaffold and install the strict pnpm monorepo.
- [x] Implement Worker health/error foundation and Mini App shell.
- [x] Create initial D1 schema/migration and repository smoke.
- [x] Add unit/integration/security/E2E foundations and CI.
- [x] Create the isolated private `Jeremih333/velora` repository and prove the full security,
      clean-clone integration, build and multi-engine E2E gate on GitHub Actions.
- [x] Run complete local quality gate.
- [x] Create isolated `velora-staging` and `velora-production` D1 resources.
- [x] Deploy staging and prove smoke; production remains gated by real bot/AI secrets.

## Milestone 1 — IN_PROGRESS

- [x] Secure Telegram initData verification, persisted sessions and CSRF protection.
- [x] Idempotent webhook command handlers and safe Telegram image ingestion.
- [x] Configure and smoke the new Velora BotFather bot: reconciliation is `READY`, live initData
      authenticated the owner and a deduplicated operational alert was delivered and resolved.
- [x] Add a compact persisted four-step onboarding with explicit policy choice, optional Mature
      gate, optional private persona, live safe recommendations and immediate story start.

## Milestone 2 — VERIFIED_MVP

- [x] Persona CRUD, ownership, visibility, default selection and authenticated UI.
- [x] Character CRUD with immutable versions and optimistic conflict protection.
- [x] Split the character editor into the required authoring sections and autosave valid private
      drafts with explicit pending/saving/saved/failed states; published edits stay manual.
- [x] Publish/unpublish/duplicate/delete and safe public discovery filters.
- [x] Owner-scoped Telegram image library, proxy and deletion.
- [x] Real local Worker+D1 integration and authenticated E2E on Android, iPhone and desktop.

## Next

## Milestone 8 — NON-RENEWING PLAN ACCESS — VERIFIED_MVP

- [x] Add typed Free, Plus and Pro entitlements for rate limits, resource counts, memory/lore
      budgets, advanced daily operations and model profiles.
- [x] Resolve the effective non-expired plan on every protected operation so expired access cannot
      leave paid capabilities enabled.
- [x] Add owner-configured one-time Stars access packs with fixed duration and no recurring fields.
- [x] Grant stacked fixed periods only after exact successful payment; make duplicate delivery and
      refunds idempotent and preserve continuous remaining access after an earlier refund.
- [x] Add owner UI, current-plan UI, RBAC, account export/erasure, operational distribution,
      Worker+D1 integration and responsive E2E coverage.
- [x] Restore the pre-0025 staging export, migrate to 0025/63 tables and deploy staging Worker
      `762922ac-5c70-40f5-a6cd-a4dd13f5dd23` with both paid gates still disabled.

## Next

## Milestone 8 — VERIFIED

- [x] Add the missing root owner README covering requirements, install, local development,
      environments, D1, R2, Workers, Telegram/BotFather, BotHub, migrations, staging, production,
      tests, backup and restore from zero.
- [x] Keep every paid or production operation behind an explicit human gate and document only
      one-time Stars/manual BotHub funding with Cloudflare Free as the default.

## Next

## Milestone 7 — VERIFIED

- [x] Add a guarded, idempotent staging-only quality seed with four synthetic users, four personas,
      twelve SAFE characters, two lorebooks, a 240-message chat and three moderation cases.
- [x] Prove repeat application on a fresh local D1, create a pre-seed remote backup and verify exact
      staging counts, quick check, foreign keys and zero synthetic sessions.
- [x] Add reusable typed BotHub SSE fixtures for fragmented success, missing usage and stream errors,
      and consume them directly in adapter regression tests.

## Next

## Milestone 6 — IMPLEMENTED_GATED

- [x] Configurable owner-only one-time Stars pack catalog without seeded prices.
- [x] Native MiniApp invoice UI with explicit terms, balance and payment history.
- [x] Exact pre-checkout, idempotent successful grant and idempotent refund reversal.
- [x] Reject recurring payloads and prove no double grant in Worker+D1 integration.
- [x] Android/iPhone/desktop purchase UI E2E through a Telegram API mock.
- [ ] Enable or price packs only after legal review, a new Velora bot and live Stars smoke.

## Next

## Milestone 3 — VERIFIED_MVP

- [x] Conversation lifecycle, idempotent writes and immutable message branches.
- [x] Generation locks, stop semantics, prepaid budget gates and streaming chat.
- [x] Regenerate variants, continuation, immutable user/assistant edits and branch restoration.
- [x] Message copy/report/model-info/delete actions and confirmed conversation deletion UI.
- [x] Safe CommonMark/GFM rendering with raw HTML removal and unsafe-link regression tests.
- [x] Add an exact-assembly Prompt Inspector for character creators and administrators, with a
      regression proving normal readers cannot inspect another creator's hidden prompt.
- [x] Smart autoscroll, jump-to-bottom and responsive message action controls.
- [x] Manual editable/versioned memory with restore.
- [x] Idempotent background memory jobs, leases, bounded retry/dead-letter and Free deterministic
      summaries through 500-message active branches.
- [x] Traverse long branches in bounded D1 pages and hierarchically summarize 1,201-message
      regression history without truncating its beginning, middle or end.
- [x] Add a bounded transient-only AI retry/fallback chain with explicit per-model ceilings,
      no model switch after the first delta and single final ledger charge.
- [x] Add an explicit owner-only private test chat for character drafts, preserve its versioned
      snapshot and exclude preview conversations from creator chat statistics.

## Milestone 4 — VERIFIED_MVP

- [x] Lorebook and entry CRUD with strict validation and ownership checks.
- [x] Character/conversation attachments and deterministic runtime activation.
- [x] Key, Unicode, ordering and token-budget regression coverage.
- [x] Creator inspector and Mini App management across supported viewports.
- [x] Versioned safe lorebook export and atomic private import with ownership, IDOR,
      idempotency and 100-entry bounds.

## Milestone 5 — VERIFIED_MVP

- [x] Reports with target access validation, taxonomy, duplicate and rate protection.
- [x] RBAC moderation queues, protected-role hierarchy and reasoned actions.
- [x] Appeal recovery, including access for suspended/banned accounts.
- [x] State restoration on overturned appeals and append-only audit evidence.
- [x] User report and moderator queue Mini App flows.
- [x] Contextual risk signals for moderators with an explicit no-automatic-sanction invariant.

## Milestone 7 — VERIFIED_MVP

- [x] Safe `{{char}}`, `{{user}}`, `{{persona}}`, `{{scenario}}`, `{{description}}` and
      `{{memory}}` expansion with escaping and unknown-variable visibility.
- [x] Alternative greeting selection and rendered persona snapshots at conversation start.
- [x] Example dialogue parsing with a bounded context share and preserved recent history.
- [x] Explicit prompt precedence for creator, memory, lore, chat and post-history instructions.
- [x] Per-conversation model, response length, temperature, output limit, persona mode and custom
      instruction controls in the Mini App.
- [x] Worker+D1 prompt inspection plus Android/iPhone/desktop settings regression coverage.

## Next

## Milestone 8 — VERIFIED_MVP

- [x] Idempotent one-user-one-like and one-user-one-bookmark operations backed by D1 constraints.
- [x] Optional one-per-user 1–5 rating and bounded review with update/delete semantics.
- [x] Public cards expose counts and the current user's state without exposing private identities.
- [x] Creator totals for chats, likes, bookmarks and ratings without viewer identity disclosure.
- [x] Search covers character name, creator and tags; interactions pass Worker+D1 and 3-device E2E.

## Milestone 9 — VERIFIED_MVP (reliability slice)

- [x] Enforce fixed route-specific limits by internal user and plan, with IP only as a
      non-blocking abuse signal for shared mobile NAT safety.
- [x] Emit structured request logs with request ID, normalized route, status, latency and hashed
      actor, without prompts or private message bodies.
- [x] Store allowlisted privacy-first product events only after successful operations; generation,
      memory and payment completion events are source-idempotent.
- [x] Add admin operations aggregates and owner-only deterministic feature flags that update
      without redeploy and append to the audit log.
- [x] Back up and migrate staging through 0007, verify integrity, deploy and smoke Worker
      `c751bbe4-049b-4b00-a673-28010338d480` (code plus generated staging secrets).
- [x] Add bidirectional user blocks, versioned export manifest, seven-day cancellable deletion and
      scheduled erasure with retained financial/audit evidence.
- [x] Back up and migrate staging through 0008, verify 52-table integrity, deploy and smoke Worker
      `17e09d2d-cf5c-4470-9a47-04cf7f4d18df`.
- [x] Restore the pre-0008 staging export into isolated D1, migrate forward, verify integrity and
      start the real Worker against the restored database.
- [x] Add authenticated public-response caching with block-aware keys and mutation invalidation.
- [x] Back up staging before 0009, prove an isolated restore through 0010, verify 53-table
      integrity, deploy Worker `9bc46c84-e517-4b9d-817a-5c7232b9046e` and smoke BotHub CSP.
- [x] Add owner-only moderator appointment/revocation with hidden staff hierarchy and audit trail.
- [x] Add privacy-safe D1 operational alerts, atomic delivery lease, cooldowns, budget/error
      thresholds and owner/admin inspection; restore and deploy through 0011.
- [x] Back up and restore staging, migrate fallback configuration through 0012, deploy Worker
      `c61f9d74-f1e2-45e5-95d7-f1d96b30e3ee` and verify D1 health.
- [x] Add bounded local load smoke for 40 concurrent users/D1/search operations and four
      independent AI streams; record budget bottleneck and measured latency without loading prod.
- [x] Bound initial chat DOM rendering to 80 messages with accessible history expansion and test
      1,000-message logic plus 100-message Android/iPhone/Desktop behavior.
- [x] Deploy the bounded chat/load hardening to staging Worker
      `898e6712-e967-4670-9e81-b6824d39f232` and verify health plus D1 integrity.
- [x] Preserve authenticated state and chat drafts across offline/online transitions, normalize
      browser network errors and add keyboard/reduced-motion/200%-font E2E regressions.
- [x] Deploy resilient/offline and accessibility hardening to staging Worker
      `220aa465-132a-4427-9acd-9bec7548c3fd`; verify health, readiness, CSP and D1 integrity.
- [x] Correct the annual BotHub estimate for the fixed per-request fee, add that fee to the
      runtime reservation/ledger, restore the pre-0013 backup, migrate staging and deploy Worker
      `8dc5acb9-577f-4ddf-9927-06a3da4bd28a`.
- [x] Separate user-billable generation cost from owner provider spend, persist all started
      retry/fallback/stop/failure attempts, restore pre-0014 and deploy staging Worker
      `7d9be41c-ac1e-46ca-99d8-360725f0e5c2`.
- [x] Add secret-safe, leased Telegram Bot API reconciliation for webhook, commands, menu and
      descriptions; restore pre-0015, migrate staging and deploy Worker
      `a8b3dd5c-e06f-460a-9ba7-367d7a9f65ee`; reconciliation reached `READY` without retries.
- [x] Reprocess confirmed owner Telegram ID `1040929628` through verified live Telegram initData;
      persist `OWNER` and active sessions without manual SQL.
- [x] Verify the installed BotHub key through an idempotent, non-generative model-list health
      reconciliation; deploy staging Worker `166b1708-1151-45da-80e4-41761e4b3c39` with both
      external integrations in `READY`.
- [x] Witness one synthetic Telegram operational alert in the owner's real chat, remove the exact
      staging fixture and verify the alert reaches `RESOLVED` with no notification lease left.
- [x] Add an owner-only, explicitly confirmed, one-attempt BotHub roleplay checkpoint with no
      retry/fallback, 32-token output cap, immutable accounting evidence and no persisted prompt or
      generated text; restore pre-0016 and deploy staging Worker
      `6b3f3d29-eaa4-4be4-8cae-bff92a4e8ee7` without executing the paid request.
- [x] Preserve the consented V1 HTTP failure, classify future provider status without response
      bodies, validate the exact roleplay model through the free `/models` check and deploy an
      independently consented BotHub-documented V2 protocol in staging Worker
      `9458aced-6b94-4bc3-90c5-8a65e509a905` without executing V2.
- [x] Fail closed before claiming V2 when its model is absent, persist only the reviewed
      key-catalogue intersection through migration 0018, restore the pre-0018 backup, and deploy
      staging Worker `e2ae30f4-dc76-481c-a75d-5a1d50508d8f`; selected candidate is
      `deepseek-chat-v3.1` and V2 has zero run rows.
- [x] Add the deployment-level `PAID_AI_ENABLED=false` gate, route every profile away from
      unavailable historical models through migration 0019, restore the pre-0019 backup, and
      deploy staging Worker `59d4e9f3-e0d6-4aa9-93f1-220b5839e440`; paid roleplay remains off and
      the V3 run count remains zero.
- [x] Require a completed V3 run whose model matches both the active profile and reconciled BotHub
      capability even after explicit paid-AI enablement; pass the full quality gate and deploy
      staging Worker `a272d2ca-caf3-4062-a5ff-4a6b7cdf0405` without executing V3.
- [x] Route every Mature character publication and published-character edit through one active
      human moderation case, keep it out of discovery until approval, replace unsafe Unicode
      `LIKE` search with literal `instr` matching, restore the pre-0020 backup and deploy staging
      Worker `35101cbf-0132-4bf6-8ba0-969770f198d8` with paid AI still disabled.
- [x] Restore the pre-0021 staging backup independently, migrate to 0021, deploy private draft
      previews in Worker `988210d1-cac8-4af4-b0ff-fdd47b5b9d59`, and verify D1 integrity while
      paid AI and payments remain disabled.
- [x] Restore the pre-0022 staging backup independently, migrate to 0022/58 tables and deploy
      idempotent onboarding in Worker `0122d30b-9b90-463b-aaa8-46d70dd323f0` with paid gates off.
- [x] Deploy the sectioned conflict-safe draft autosave to staging Worker
      `5813cffa-9ffd-4439-bb8d-bdb28c1e748c`; no D1 migration or paid gate change was required.
- [x] Deploy the exact-assembly Prompt Inspector to staging Worker
      `3cb376b6-f81c-497b-b2b9-4dad4b2cc043`; health/ready and 58-table/22-migration integrity
      passed, paid gates stayed off and the V3 run count stayed zero.
- [x] Back up and restore staging, migrate to 0023/59 tables, deploy private support requests,
      administrator processing, legal information and export/erasure coverage with paid gates off.
- [x] Separate the Velora user profile from Telegram identity, enforce avatar ownership,
      privacy and bidirectional blocks, use profile names in discovery/reviews/public cards,
      add profile reporting and reversible content moderation, restore the pre-0024 backup and
      deploy staging Worker `c2e83ae1-6ba1-4dc0-a901-2c35257e1e1d` at 0024/60 tables.
- [x] Localize Telegram command, payment and media replies plus the Mini App button in Russian and
      English; normalize `en`, `en-US` and `en_US` for new users without overwriting a locale later
      selected in Velora, with unit/local Worker coverage and staging Worker
      `e3b2da11-75b2-46b0-bf97-f994259741ae` health/readiness smoke.
- [x] Establish typed web RU/EN dictionaries and runtime provider; localize standalone/auth,
      offline recovery, first-run onboarding, main navigation, discovery, one-time billing and
      settings, including an E2E account-language switch without reload. Remaining views stay
      explicitly tracked rather than being called complete; deploy staging Worker
      `c0156f2d-d446-4888-898f-c6519c90983f` with paid gates off and zero V3 runs.
- [x] Extend typed RU/EN localization through the complete chat flow: list, thread, message actions,
      story settings, memory, prompt inspector and lore panel; verify the language switch in the
      authenticated browser flow and deploy staging Worker
      `2fef274a-9baf-40d5-a15d-fecff72bfb3f` with BotHub READY and zero V3 runs.
- [x] Localize persona management and the complete versioned character editor, including publish
      states, autosave feedback, greeting preview and shared editor/error controls; verify both
      editors after an in-session language switch and deploy staging Worker
      `0cf2cc06-1040-45fc-8659-b9708b2cc132` with BotHub READY and zero V3 runs.
- [x] Localize complete lorebook management: import/export, book settings, character attachments,
      entry editing and deterministic key options; verify a real existing book after the runtime
      language switch and deploy staging Worker `f89cd7e7-5439-4d13-9b1f-d45e8708f645` with BotHub
      READY and zero V3 runs.

## Next

- Continue removing hardcoded Russian UI strings from profiles,
  profiles, support and administration.
- Optional reviewed advanced classifiers.
- Real Stars smoke and one explicitly approved prepaid BotHub V3 roleplay quality/accounting
  checkpoint through the staged owner control. V1 is immutable failed evidence; V2 was never
  claimed because its required model was absent.

Tasks move to `VERIFIED` only with evidence in `STATUS.md` and final verification.
