# Velora toolkit

Этот каталог создан первым артефактом нового проекта. Инструменты работают только из корня Velora
и аварийно завершаются, если отсутствует `.velora-project`.

- `assert-boundary.ps1` — подтверждает границу Velora и не позволяет затронуть RoleMate.
- `bootstrap.ps1` — проверяет Node.js, Corepack, pnpm, Git и Wrangler.
- `secret-scan.ps1` и `secret-scan.mjs` — ищут случайно добавленные токены и приватные ключи.
- `verify.ps1` — запускает полный локальный quality gate.
- `cost-estimator.mjs` — воспроизводимо рассчитывает годовой расход AI.
- `configure-telegram.mjs` — dry-run, проверка identity и применение команд/menu/webhook.
- `configure-telegram-secure.ps1` — проверяет bot identity до мутаций, устанавливает независимые
  Telegram/webhook/session secrets, публикует выбранный staging/test Worker и только затем
  применяет конфигурацию Bot API. Test Server разрешён только для `telegram-test`.
- `set-bothub-key.ps1` — скрыто передаёт ключ BotHub непосредственно в Cloudflare Secret.
- `test-d1.mjs`, `test-api.mjs` и `test-restore.mjs` — проверяют миграции, Worker API и восстановление.
- `seed-staging.mjs` — создаёт только явно синтетические staging-данные.

Секреты не помещаются в этот каталог. Production-секреты добавляются только через Cloudflare
Secrets после отдельного human checkpoint.
