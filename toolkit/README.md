# Velora toolkit

Этот каталог создан первым артефактом нового проекта. Инструменты работают только
из корня Velora и аварийно завершаются, если отсутствует `.velora-project`.

- `assert-boundary.ps1` — проверяет, что команда выполняется в Velora, а не RoleMate.
- `bootstrap.ps1` — проверяет Node.js, Corepack, pnpm, Git и Wrangler.
- `secret-scan.ps1` — ищет случайно добавленные токены и приватные ключи.
- `verify.ps1` — запускает полный локальный quality gate проекта.
- `cost-estimator.mjs` — воспроизводимо считает годовой расход AI.
- `configure-telegram.mjs` — настраивает команды, menu button и webhook; по умолчанию dry-run.
- `set-bothub-key.ps1` — скрыто запрашивает API-ключ BotHub и передаёт его напрямую в
  Cloudflare Secret; по умолчанию только в staging, production требует отдельный флаг.
- `test-api.mjs` — поднимает настоящий local Worker+D1 и проверяет auth/settings/persona flow.

Секреты в этот каталог не помещаются. Production-секреты будут добавляться только
через Cloudflare secrets после отдельного human checkpoint.
