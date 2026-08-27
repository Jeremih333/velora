# Final test report

## Current full-tree gate — 24 August 2026

The monolithic `toolkit/verify.ps1` gate passed on the exact deployed source tree after generated
Wrangler dry-run directories were excluded from formatting and lint input.

| Gate                                                  | Current result                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Secret scan / format / docs / lint / strict typecheck | PASS                                                           |
| Unit and regression                                   | PASS — 319 tests in 69 files                                   |
| Roleplay quality                                      | PASS — 7/7                                                     |
| OpenAPI contract                                      | PASS — 5/5                                                     |
| Integration                                           | PASS — 122 tests in 14 files plus Worker/D1/R2-adapter journey |
| Load smoke                                            | PASS — 40 user, 40 D1, 40 search and 4 AI requests             |
| Web + Worker production build and bundle budget       | PASS                                                           |
| Playwright                                            | PASS — 20/20 across iPhone, Android, tablet and desktop        |

This automated result does not replace the explicit real-device or canonical visual-approval
checkpoints documented below.

Verification run: 21 August 2026. Baseline production version:
`6b8c010f-d03e-43f1-8da7-08773fa90106`. Telegram Web App cache-bust hotfix version:
`c2df135a-6335-4297-927f-36d813ef386f`.

| Gate                       | Result  | Evidence                                                           |
| -------------------------- | ------- | ------------------------------------------------------------------ |
| Secret scan                | PASS    | repository scanner completed before all other gates                |
| Format                     | PASS    | Prettier checked the complete repository                           |
| Documentation              | PASS    | local documentation links resolved                                 |
| Lint                       | PASS    | ESLint completed with zero warnings                                |
| Typecheck                  | PASS    | strict TypeScript project build completed                          |
| Unit/regression            | PASS    | 277 tests in 60 files                                              |
| Roleplay quality           | PASS    | 7 bounded standard scenarios                                       |
| API contract               | PASS    | 5 OpenAPI contract tests                                           |
| Integration                | PASS    | 107 tests plus real local Worker/D1/R2-adapter journey             |
| E2E                        | PASS    | 15/15: five each on iPhone, Android and desktop projects           |
| Accessibility              | PASS    | automated axe scenarios are included in all three E2E projects     |
| Build                      | PASS    | Web and Worker production builds; initial JS 349,492 bytes         |
| Visual reference parity    | FAIL    | all 46 states have evidence, but exact parity is not approved      |
| Human Telegram device pass | BLOCKED | Android, iOS and Web require explicit current-build human evidence |

The automated release gate itself passed without retries. This report does **not** declare the
master contract complete: a visual `FAIL` or human-device `BLOCKED` result forbids a `Project
complete` claim. Detailed row status is in `docs/testing/FINAL_SCREENSHOT_MATRIX.md`; the current
human evidence is in `docs/testing/FINAL_HUMAN_DEVICE_PASS.md`.

Post-deploy read-only checks returned HTTP 200 for `/health`, `/ready`, `/openapi.json` and `/`.
Remote D1 reported `quick_check=ok`, no foreign-key violations and 43 applied migrations. The
deployment did not change Telegram webhook configuration and kept paid AI, sponsored Free AI and
payments disabled.

The hotfix adds `WEB_APP_CACHE_VERSION=20260821-2` to every new bot Web App button and to the
reconciled persistent Telegram menu URL. Its focused URL/configuration/webhook/preflight/traceability
suite passed 48/48. The production HTML, emitted entry asset and authenticated application chunk
returned HTTP 200; neither emitted JavaScript asset contains the obsolete `CLOUDFLARE FREE` header
label. A fresh `/start` or `/app` is still required to create the cache-busted Telegram launch and to
record the persistent-menu reconciliation in D1.
