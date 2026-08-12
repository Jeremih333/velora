# Production preflight

Updated: 2026-08-12. Status: `BLOCKED_HUMAN` before any production mutation.

## Verified read-only state

Run from the Velora root:

```powershell
corepack pnpm production:preflight
corepack pnpm production:preflight -- --remote
```

The first command validates only repository configuration and the contiguous migration sequence.
The second also performs read-only Wrangler calls. It never migrates D1, deploys a Worker, writes a
secret or changes Telegram.

The 2026-08-12 remote run proved:

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

## Remaining human checkpoint

Before phase 1 the owner must explicitly authorize the production migration/deploy and enter the
Velora BotFather token and BotHub key through hidden prompts. Before phase 2 the owner must confirm
that moving the single bot webhook from staging to production is intended.

After that first authorization, run the guarded phase exactly once from a visible PowerShell:

```powershell
.\toolkit\deploy-production-phase1.ps1 -ConfirmProductionDeployment
```

The script completes the full local gate, Telegram identity check and non-generative BotHub key
check before its first mutation. It exports production D1, applies the reviewed migrations and
supplies all four secrets atomically with the initial Worker version. It then smoke-tests health,
readiness, OpenAPI and D1 integrity. It never calls `setWebhook`; staging continues receiving bot
updates until the separate phase-2 checkpoint.

The absence of Stars is not a blocker for the Free product: payments stay disabled, no packs are
created and no payment claim is made. Paid AI also remains disabled in production until a separate
bounded production-provider checkpoint is authorized after the non-AI rollout.
