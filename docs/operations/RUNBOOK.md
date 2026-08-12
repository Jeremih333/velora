# Owner runbook

- Local: `corepack pnpm install`, `pnpm db:migrate:local`, `pnpm dev`.
- Verify: `powershell -ExecutionPolicy Bypass -File toolkit/verify.ps1`; then `pnpm test:e2e`.
- Deploy: follow `DEPLOYMENT.md`; never deploy with a failing gate.
- Production preflight: run `pnpm production:preflight -- --remote` and review
  `PRODUCTION_PREFLIGHT.md`. It is read-only. Do not treat a missing Worker or missing secrets as a
  successful rollout, and do not switch the shared Telegram webhook implicitly.
- Rollback: `wrangler deployments list` then `wrangler rollback <version>`.
- Bot health: `/health`, `/ready`, update inbox age and the `telegram_bot` row in
  `integration_reconciliations`. `READY` means the scheduled reconciler verified the bot identity
  and applied the webhook, commands, menu button and descriptions. It stores only a desired-state
  hash and sanitized error code; bot and webhook secrets remain Worker secrets.
- BotHub health: inspect the `bothub_provider` row in `integration_reconciliations` and the
  `provider_model_capabilities` row. The scheduled check calls only the authenticated model-list
  endpoint, hashes the full catalogue, persists only its allowlisted intersection and performs no
  generation. `READY` proves key/API/candidate reachability, not billing accuracy.
- Paid checkpoint: the owner opens `Moderation -> System`, reads the cost warning, selects the
  consent checkbox and launches the currently offered version. V1 remains an immutable failed
  `OPENAI_INCLUDE_USAGE` attempt. V2 was not executed because its model was unavailable. V3 uses
  the available `deepseek-chat-v3.1` model and BotHub's documented streaming body without
  `stream_options`; each run key permits one attempt only, has no retry/fallback and persists
  status/category, hashes and accounting only. Never reset or delete a row to repeat a request.
- Alerts: inspect `/api/v1/admin/operations/alerts`; verify `OWNER_TELEGRAM_ID` belongs to the new
  Velora owner before enabling outbound Telegram alerts. Never copy an identity from another bot.
- SLO baseline: run `pnpm slo:staging` after staging deploy and review
  `../testing/SLO_BASELINE.md`. Any failed contract probe blocks promotion. Do not point the tool at
  production; its allowlist rejects production deliberately.
- AI credit: inspect internal usage/runway, show the owner the exact BotHub amount and payment
  method, then let the owner manually fund it; never automate a purchase or recurring payment.
- Live Stars: follow [LIVE_STARS_CHECKPOINT.md](../testing/LIVE_STARS_CHECKPOINT.md). Do not enable
  or price a pack until the owner accepts the legal/payment checkpoint and explicitly authorizes
  the one-Star staging purchase.
- Backup/restore: follow `BACKUP_RESTORE.md` and record the staging restore result.
- Synthetic staging data: follow `../testing/FIXTURES.md`. The seed runner is allowlisted to the
  staging D1 ID, requires an exact confirmation and exports a backup before its idempotent import;
  never copy the seed SQL into migrations or apply it to production.
- Moderation: work assigned cases with least privilege and a reasoned audit action.

The exact bot token, AI key and session key are Cloudflare secrets and never appear here.
