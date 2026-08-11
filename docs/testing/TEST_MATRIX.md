# Test matrix

| Flow                  | Unit                 | Integration            | E2E                    | Security           |
| --------------------- | -------------------- | ---------------------- | ---------------------- | ------------------ |
| Telegram auth/session | HMAC/time            | D1 account             | open app               | forge/replay/CSRF  |
| First-run onboarding  | bounded schema       | atomic/idempotent D1   | 4 steps/start chat     | policy/age/CSRF    |
| Persona/character     | validation/template  | CRUD/version           | create/publish/search  | ownership/IDOR     |
| Likes/reviews         | DB constraints       | idempotent aggregates  | react/update/review    | self/duplicate     |
| Chat/branches         | state/prompt         | stream/idempotency     | send/regenerate/edit   | double send/budget |
| Prompt inspector      | exact rendered parts | creator 200/reader 403 | sections/token view    | hidden prompt IDOR |
| Memory/lore           | version/hierarchy    | 1,201-message D1 flow  | attach/inspect         | ownership/limits   |
| Credits/payment       | ledger               | duplicate update       | test invoice           | double grant       |
| Moderation            | transitions          | case/audit             | report/appeal          | least privilege    |
| Media                 | metadata             | Telegram adapter       | upload/open            | MIME/size/path     |
| Reliability           | policy/event mapping | real Worker+D1 limits  | admin system view      | RBAC/privacy/flags |
| Fixtures/staging seed | typed SSE fixtures   | idempotent seed twice  | staging count audit    | no sessions/prod   |
| API contract          | route/security model | real Worker/Assets     | 100-path staging smoke | safe error schema  |

Bounded local capacity evidence is maintained in [LOAD_REPORT.md](LOAD_REPORT.md): 40 concurrent
authenticated/D1/search requests, four parallel independent AI streams and a long-history DOM
window regression. Synthetic load is never directed at production.

Keyboard focus, labels, reduced motion, 200% font scaling and offline draft retention are recorded
in [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md).
