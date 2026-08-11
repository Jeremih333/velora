# Infrastructure

| Environment | Worker           | D1                  | Media                    |
| ----------- | ---------------- | ------------------- | ------------------------ |
| local       | Wrangler local   | local SQLite/D1     | fixture/Telegram adapter |
| staging     | `velora-staging` | `velora-staging`    | Telegram `file_id`       |
| production  | `velora-app`     | `velora-production` | Telegram `file_id`       |

All resources are new and use the `velora-` prefix. No RoleMate IDs, service bindings or URLs are
referenced. Cloudflare remains Workers Free: 100,000 Worker requests/day, D1 5M rows read/day,
100k rows written/day, 5GB account storage and 500MB/database. Limits fail closed and trigger
degraded UX rather than an automatic paid upgrade.

Queues may be introduced for summarization/moderation with a hard application cap under the Free
10,000 operations/day allowance. R2 remains disabled until the owner can enable it without an
unacceptable billing requirement.
