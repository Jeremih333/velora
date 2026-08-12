# Production preflight

Updated: 2026-08-12. Status: `PHASE_1_VERIFIED`; phase 2 is `BLOCKED_HUMAN`.

## Verified read-only state

Run from the Velora root:

```powershell
corepack pnpm production:preflight
corepack pnpm production:preflight -- --remote
```

The first command validates only repository configuration and the contiguous migration sequence.
The second also performs read-only Wrangler calls. It never migrates D1, deploys a Worker, writes a
secret or changes Telegram.

The initial 2026-08-12 remote run proved:

- Cloudflare OAuth is authenticated to account `9d1b...fac61`;
- production Worker `velora-app` does not exist;
- isolated D1 `velora-production` exists and is not the staging database;
- all 28 migrations are pending in production;
- production Worker secrets do not exist because the Worker has not been created;
- `PAID_AI_ENABLED=false` and `PAYMENTS_ENABLED=false`;
- confirmed owner Telegram ID `1040929628` is present in production configuration;
- production and staging intentionally name the same bot, `@aivel0ra_bot`.

Only resource names, migration names and secret **names** are reported. Secret values are never
read or printed.

After the owner-authorized phase 1, the same read-only preflight now proves:

- production Worker `velora-app` exists and serves root, health, readiness and OpenAPI with HTTP
  200;
- production D1 has no pending migration among 0001-0028, `quick_check=ok`, no foreign-key
  violations and zero users;
- all four required production secret names exist without exposing their values;
- the production BotHub reconciliation is `READY`;
- production has no Telegram reconciliation row, so phase 1 did not switch the bot;
- `readyForCutover=true`, while `TELEGRAM_WEBHOOK_CUTOVER_REQUIRED` is the sole remaining blocker.

The first phase-1 smoke received a transient 404 while Cloudflare propagated the newly created
Worker route. The guarded runner now retries that propagation window. Independent HTTP retries and
clean-clone CI `31616327482` passed after the fix.

## Telegram cutover invariant

A Telegram bot can have one webhook. Configuring `@aivel0ra_bot` for `velora-app` therefore stops
Telegram updates from reaching `velora-staging`; deploying the Worker alone does not switch it.
Production setup is deliberately split into two phases:

1. install independent production secrets, migrate D1, deploy and smoke the HTTP/API surface;
2. after a final owner confirmation, atomically configure commands, menu and webhook for the
   production URL and verify `/start` plus Mini App authentication.

`configure-telegram-secure.ps1` refuses production unless `-ConfirmProductionCutover` is supplied
and the URL is exactly `https://velora-app.carreljeremih.workers.dev`. Production and staging use
independent webhook/session secrets even when the BotFather token is the same.

## Completed phase 1 and remaining human checkpoint

Phase 1 was explicitly authorized and completed. The production database backup was exported, all
28 migrations were applied, four secret names were installed atomically, and Worker safety hotfix
`9fd2e014-197f-4b30-8c3a-75238201f774` was verified. The hotfix keeps scheduled production Telegram
reconciliation disabled.

For audit/recovery reference, phase 1 was performed through:

```powershell
.\toolkit\deploy-production-phase1.ps1 -ConfirmProductionDeployment
```

Do not run that phase-1 command again as a normal deployment action. Its exact-state guards reject
an already deployed production Worker. The script never called `setWebhook`; staging continues
receiving bot updates until the separate phase-2 checkpoint.

Phase 2 remains a separate owner decision. It must not run until the owner explicitly confirms that
moving the single `@aivel0ra_bot` webhook from staging to production is intended:

```powershell
.\toolkit\cutover-production-telegram.ps1 -ConfirmProductionWebhookCutover
```

It does not rotate `SESSION_SIGNING_KEY`, touch BotHub, migrate D1 or enable either paid gate. It
updates the production Telegram token/webhook secret together, applies commands/menu/webhook and
verifies the exact webhook URL. If verification fails after applying begins, it creates a new
staging webhook secret and restores the staging webhook. Scheduled production Telegram
reconciliation stays disabled; enabling it is deliberately outside this cutover.

The absence of Stars is not a blocker for the Free product: payments stay disabled, no packs are
created and no payment claim is made. Paid AI also remains disabled in production until a separate
bounded production-provider checkpoint is authorized after the non-AI rollout.
