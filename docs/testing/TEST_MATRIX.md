# Test matrix

| Flow                  | Unit                 | Integration                                                              | E2E                        | Security               |
| --------------------- | -------------------- | ------------------------------------------------------------------------ | -------------------------- | ---------------------- |
| Telegram auth/session | HMAC/time            | D1 account                                                               | open app                   | forge/replay/CSRF      |
| First-run onboarding  | bounded schema       | signed new Telegram user → D1 account → persona → SAFE discovery → story | 4 steps/persona-bound chat | policy/age/replay/CSRF |
| Persona/character     | validation/template  | CRUD/version                                                             | create/publish/search      | ownership/IDOR         |
| Likes/reviews         | DB constraints       | idempotent aggregates                                                    | react/update/review        | self/duplicate         |
| Chat/branches         | state/prompt         | stream/idempotency                                                       | send/regenerate/edit       | double send/budget     |
| Prompt inspector      | exact rendered parts | creator 200/reader 403                                                   | sections/token view        | hidden prompt IDOR     |
| Roleplay quality A-F  | typed prompt corpus  | real builder + lore                                                      | V3 HTTP 200                | bounded/no leakage     |
| Memory/lore           | version/hierarchy    | 1,201-message D1 flow                                                    | attach/inspect             | ownership/limits       |
| Credits/payment       | ledger               | duplicate update                                                         | test invoice               | double grant           |
| Moderation            | transitions          | case/audit                                                               | report/appeal              | least privilege        |
| Media                 | metadata             | Telegram adapter                                                         | upload/open                | MIME/size/path         |
| Reliability           | policy/event mapping | real Worker+D1 limits                                                    | admin system view          | RBAC/privacy/flags     |
| Fixtures/staging seed | typed SSE fixtures   | idempotent seed twice                                                    | staging count audit        | no sessions/prod       |
| API contract          | route/security model | real Worker/Assets                                                       | 100-path staging smoke     | safe error schema      |

Bounded local capacity evidence is maintained in [LOAD_REPORT.md](LOAD_REPORT.md): 40 concurrent
authenticated/D1/search requests, four parallel independent AI streams and a long-history DOM
window regression. Synthetic load is never directed at production.

Keyboard focus, labels, reduced motion, 200% font scaling and offline draft retention are recorded
in [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md).

Twenty-four Linux pixel baselines for eight critical states across Android, iPhone and desktop are
recorded in [VISUAL_REVIEW.md](VISUAL_REVIEW.md) and compared by the mandatory E2E gate.

The deterministic A-F roleplay corpus and the boundary of what it can prove without a paid model
call are recorded in [ROLEPLAY_QUALITY_REPORT.md](ROLEPLAY_QUALITY_REPORT.md).
