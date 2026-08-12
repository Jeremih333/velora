# Telegram Test Server checkpoint

Status: `BLOCKED_HUMAN`. This path uses no real Stars and is strictly separate from the normal
Telegram account, `@aivel0ra_bot`, staging D1 and production D1.

Telegram documents a dedicated test environment for bots and Mini Apps. It requires a separate
test-server user and a new bot created through the test-server `@BotFather`. Bot API calls use the
path `https://api.telegram.org/bot<TOKEN>/test/METHOD_NAME`.

Official references:

- <https://core.telegram.org/bots/payments-stars#testing-payments>
- <https://core.telegram.org/bots/webapps#testing-mini-apps>
- <https://core.telegram.org/bots/features#dedicated-test-environment>

## Isolation already prepared

- Worker environment name: `velora-telegram-test`;
- D1 name: `velora-telegram-test`;
- D1 ID: `4de2d24c-04b5-461c-8853-d161255cd1c7`;
- runtime identity: `ENVIRONMENT=telegram-test`;
- Bot API identity: `TELEGRAM_API_ENVIRONMENT=test`;
- `PAID_AI_ENABLED=false`;
- `PAYMENTS_ENABLED=false`;
- no RoleMate, Velora staging or Velora production binding.

All 28 immutable migrations were applied to this isolated D1 on 2026-08-12. The remote database
then reported no pending migrations, `PRAGMA quick_check=ok`, no foreign-key violations and 65
application tables (67 including D1/SQLite service tables). A Worker dry-run resolved only the
test D1 binding and retained both paid feature flags as `false`; no Worker was deployed.

Runtime validation rejects `TELEGRAM_API_ENVIRONMENT=test` anywhere except the isolated
`telegram-test` environment, and rejects that environment if test mode is absent. This prevents a
normal Telegram bot token or normal user identities from being mixed into the test D1.

The official documentation specifies the `/test/` path for Bot API methods but does not specify a
test-server file-download URL. Test-server media proxying therefore fails closed until it can be
verified against the new test bot; the Stars checkpoint does not require media upload.

## One required owner action

1. Open Telegram Desktop.
2. Open Settings.
3. Hold `Shift + Alt`, right-click **Add Account**, then choose **Test Server**.
4. Register/sign in to a separate test-server account.
5. In that test environment, open `@BotFather` and create a new Velora test bot.
6. Keep the resulting token private. Enter it only when the local secret prompt is opened.

The ordinary `@aivel0ra_bot` token cannot be used: production and test Telegram are separate.

## Prepared activation after the test bot exists

Before any deployment, replace only the placeholder test username in `apps/api/wrangler.jsonc`.
Then run the guarded setup window below. It performs a dry-run and verifies `getMe` through the
Test Server before changing Cloudflare, generates independent webhook/session secrets, deploys
only `telegram-test`, and applies the webhook only after a successful deployment. It refuses the
normal or placeholder bot username. Do not reuse staging secrets.

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/configure-telegram-secure.ps1 `
  -Environment telegram-test `
  -BotUsername NEW_TEST_BOT_USERNAME `
  -PublicAppUrl https://velora-telegram-test.carreljeremih.workers.dev
```

The token is entered in a hidden prompt and must never be pasted into chat, source files or logs.

## Free Stars verification

After the isolated Worker and bot are healthy:

1. create a test-only `STAGING_PLUS_1D` pack for `1 XTR`;
2. enable `PAYMENTS_ENABLED=true` only in `telegram-test`;
3. buy it from the Telegram test-server account;
4. verify `pre_checkout_query`, one `successful_payment`, one access grant and replay idempotency;
5. submit one refund and verify one reversal plus replay idempotency;
6. disable the pack and restore `PAYMENTS_ENABLED=false`.

This proves the Telegram protocol without real Stars. It does **not** prove a live main-Telegram
payment and does not authorize staging/production sales.
