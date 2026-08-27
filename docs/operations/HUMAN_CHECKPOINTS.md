# Human checkpoints and secret entry

Velora stops before an action that needs authority or a secret the operator has not supplied. The
agent must not infer consent from an earlier deployment and must not ask the owner to paste a secret
into chat, GitHub, an issue, a commit, a command argument or a public log.

## Required checkpoint format

```text
HUMAN CHECKPOINT

Причина:
<why automation cannot safely continue>

Уже подготовлено:
<verified work that does not require the owner action>

Нужно от владельца:
1. <smallest exact action>
2. <confirmation, if needed>

Не публикуйте секрет в GitHub или чате.

После этого:
<the exact verification and next action>
```

Use this checkpoint for Cloudflare login, GitHub OAuth, BotFather, Telegram bot tokens, BotHub API
keys, real CAPS purchases, real Telegram Stars payments and domain purchases. A checkpoint pauses
only the affected external action; safe local validation may continue.

## Approved secret paths

- Cloudflare identity: use the visible `wrangler login` OAuth browser flow. Verify it afterward with
  `wrangler whoami`; never accept a screenshot alone as authorization evidence.
- BotHub key: run `toolkit/set-bothub-key.ps1`. Its `Read-Host -AsSecureString` prompt pipes the value
  directly to `wrangler secret put BOTHUB_API_KEY`; the value is never printed.
- Telegram token: run `toolkit/set-telegram-token.ps1` or the guarded Telegram setup/cutover
  scripts. They use hidden input, validate BotFather format and zero the unmanaged buffer.
- Reusable local operator secrets: run `toolkit/manage-velora-secrets.ps1`. Values are encrypted by
  Windows DPAPI for the current account and the file ACL is restricted to that account.

Production switches still require their explicit confirmation flag even when a secret already
exists. Secret availability is not release authorization.

## After the checkpoint

1. Verify identity/capability without printing a secret.
2. Apply only the explicitly authorized environment change.
3. Run its health, readiness and regression evidence.
4. Record the version and whether production, D1, Telegram webhook, payments or paid AI changed.
5. Clear temporary environment values and unmanaged plaintext buffers.
