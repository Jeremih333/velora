# Velora

Velora — отдельная Telegram Mini App-платформа для AI roleplay. Проект физически и логически
изолирован от RoleMate: у него собственный репозиторий, Worker, D1, URL, бот и секреты.

Текущее состояние: staging MVP проверен, production намеренно не развёрнут. Cloudflare остаётся на
Free-плане; BotHub оплачивается вручную и только для пользовательского roleplay. Карты, подписки,
автопродление и автоматическое пополнение не используются.

## 1. Требования

- Windows PowerShell 5.1+ или PowerShell 7;
- Node.js 24+;
- Corepack;
- Git;
- Cloudflare-аккаунт с Workers и D1;
- отдельный Telegram-бот, созданный через BotFather;
- BotHub API key с подходящим тарифом — только для реальной генерации.

Проверка инструментов и границы проекта:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/bootstrap.ps1
```

Toolkit остановит работу, если команда запущена не из Velora или отсутствует `.velora-project`.

## 2. Установка

Из корня проекта:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
```

Секреты нельзя записывать в Git, README, миграции или shell history. `.env.example` содержит только
имена параметров. Локальные значения храните в игнорируемом `apps/api/.dev.vars`, а staging и
production — только как Cloudflare Worker secrets.

## 3. Локальная разработка

Подготовить локальную D1:

```powershell
corepack pnpm db:migrate:local
```

Запустить Worker и Vite:

```powershell
corepack pnpm dev
```

Mini App не подделывает Telegram-вход в standalone-браузере. Полный авторизованный интерфейс
проверяется Playwright-сценариями либо настоящим Telegram `initData`.

Минимальные локальные переменные в `apps/api/.dev.vars`:

```dotenv
TELEGRAM_BOT_TOKEN=local-only-value
TELEGRAM_WEBHOOK_SECRET=local-only-random-value
SESSION_SIGNING_KEY=local-only-long-random-value
BOTHUB_API_KEY=optional-for-explicit-live-test-only
```

`PAID_AI_ENABLED` и `PAYMENTS_ENABLED` по умолчанию остаются `false` в `wrangler.jsonc`.

## 4. Среды

| Среда      | Worker           | D1                  | Назначение                        |
| ---------- | ---------------- | ------------------- | --------------------------------- |
| local      | Wrangler local   | `velora-local`      | разработка и изолированные тесты  |
| staging    | `velora-staging` | `velora-staging`    | проверка перед ручным production  |
| production | `velora-app`     | `velora-production` | пока не мигрирован и не развёрнут |

Staging URL: <https://velora-staging.carreljeremih.workers.dev>.

Production нельзя использовать для destructive-тестов или автоматически наполнять seed-данными.

## 5. Cloudflare Workers

Войти через OAuth CLI при необходимости:

```powershell
Push-Location apps/api
corepack pnpm exec wrangler login
corepack pnpm exec wrangler whoami
Pop-Location
```

Staging-деплой после зелёного quality gate:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/verify.ps1
corepack pnpm --filter @velora/api exec wrangler deploy --env staging
```

Проверка:

```powershell
Invoke-RestMethod https://velora-staging.carreljeremih.workers.dev/health
Invoke-RestMethod https://velora-staging.carreljeremih.workers.dev/ready
```

Worker обслуживает API и собранную Mini App как единое Cloudflare-приложение. Northflank, банковская
карта и автоматический переход на платный Cloudflare-план не являются зависимостями.

## 6. D1 и миграции

Миграции последовательны и неизменяемы после применения. Сначала local, затем backup и staging,
после отдельного ручного решения — production.

```powershell
corepack pnpm db:migrate:local
corepack pnpm --filter @velora/api db:migrate:preview
```

Проверить список staging-миграций без записи:

```powershell
Push-Location apps/api
corepack pnpm exec wrangler d1 migrations list velora-staging --remote --env staging
Pop-Location
```

Production-команда существует, но сейчас запускать её нельзя: база намеренно имеет все миграции
0001–0026 в pending. После ручного production gate:

```powershell
corepack pnpm --filter @velora/api db:migrate:production
```

## 7. Синтетические данные staging

Описание и состав: [docs/testing/FIXTURES.md](docs/testing/FIXTURES.md). Runner разрешает только
точный staging D1 ID, требует 26 миграций и `quick_check=ok`, создаёт backup, затем проверяет
количества и внешние ключи:

```powershell
node toolkit/seed-staging.mjs --apply --confirm=SEED_VELORA_STAGING
```

Seed содержит только явно синтетические `seed-*` записи и не создаёт сессии, платежи или AI-расход.

## 8. R2 и медиа

R2 сейчас не включён: аккаунт возвращал код 10042. Начальный media adapter хранит проверенные
Telegram `file_id` и проксирует файлы с контролем доступа. Нельзя включать R2 автоматически или
делать его обязательным до отдельного решения владельца. Интерфейс хранилища позволяет добавить
R2 позже без миграции приватных сообщений в логи.

## 9. Telegram bot и BotFather

1. В BotFather выполнить `/newbot` и создать отдельного бота Velora.
2. Не публиковать полученный токен и не копировать RoleMate-конфигурацию.
3. Безопасно установить токен в staging:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/set-telegram-token.ps1 -Environment staging
```

4. Настроить webhook, команды, описания и кнопку Mini App:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/configure-telegram-secure.ps1 `
  -Environment staging `
  -BotUsername aivel0ra_bot `
  -PublicAppUrl https://velora-staging.carreljeremih.workers.dev
```

5. Проверить `/start`, открытие Mini App и серверную роль владельца. OWNER определяется только из
   проверенного Telegram `initData`; единственный ожидаемый Telegram ID — `1040929628`.

Webhook без правильного secret token отклоняется. Команды идемпотентны, а приватный текст чатов не
записывается в operational logs.

## 10. BotHub и LLM key

Ключ вводится скрыто и передаётся прямо в Cloudflare secrets:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/set-bothub-key.ps1 -Environment staging
```

Проверка model-list не генерирует текст и не расходует CAPS. Реальный контрольный V3-запрос:

- выполняется только владельцем;
- требует точного подтверждения `ПОТРАТИТЬ 1 ЗАПРОС V3`;
- использует `deepseek-chat-v3.1`;
- не имеет retry или fallback;
- имеет неизменяемый idempotency key;
- не запускается автоматически после покупки тарифа или deploy.

После успешной сверки usage/balance `PAID_AI_ENABLED=true` разрешён только в staging. Production и
local остаются `false`; память, модерация, поиск и служебные задачи не должны тратить BotHub CAPS.

Годовой расчёт и допущения: [docs/operations/COST_MODEL.md](docs/operations/COST_MODEL.md).

## 11. Платежи

Цифровые покупки внутри Telegram поддерживают только одноразовые Telegram Stars (`XTR`). Карты,
YooKassa, рекуррентные платежи и auto-top-up не подключаются. В staging
`PAYMENTS_ENABLED=false`, активных packs нет. Free, Plus и Pro задают серверные лимиты персонажей,
образов, памяти, лора, продвинутых операций и разрешённых профилей модели. Владелец отдельно
создаёт разовые пакеты доступа на фиксированный срок; повторная покупка складывает срок, а возврат
отзывает только соответствующую выдачу без создания подписки. CI использует изолированный
Telegram API fixture и никогда не тратит реальные деньги.

## 12. Тесты

Полный обязательный gate:

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/verify.ps1
```

Отдельные команды:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:integration
corepack pnpm build
corepack pnpm test:e2e
```

Integration поднимает настоящий local Worker и временную D1. AI использует детерминированные
fixtures; обычный CI не вызывает платную модель. E2E проходит Android, iPhone и desktop.

## 13. Backup

Перед каждой удалённой миграцией или staging seed:

```powershell
Push-Location apps/api
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
corepack pnpm exec wrangler d1 export velora-staging --remote --env staging `
  --output "../../toolkit/backups/velora-staging-$stamp.sql"
Pop-Location
```

Для production имя базы меняется на `velora-production`, а `--env staging` удаляется. Production
backup обязателен до миграции; destructive migration без отдельного restore plan запрещена.

## 14. Restore

Неразрушающая проверка экспорта в новой временной local D1:

```powershell
node toolkit/test-restore.mjs toolkit/backups/<staging-backup>.sql
```

Drill импортирует данные backup в заново построенную схему, проверяет 65 таблиц/26 миграций,
`quick_check`, foreign keys и реальный `/ready`, затем удаляет временную базу. Он не пишет в staging
или production.

Подробности: [docs/operations/BACKUP_RESTORE.md](docs/operations/BACKUP_RESTORE.md).

## 15. Production gate

Production остаётся заблокированным, пока одновременно не выполнены:

- полный quality gate;
- staging smoke и ручные Telegram-потоки;
- успешный однократный V3 checkpoint и сверка стоимости;
- юридическая проверка Stars;
- backup/restore evidence;
- отсутствие Sev-1/Sev-2;
- явное подтверждение владельца на миграцию и deploy.

Только после этого:

```powershell
corepack pnpm --filter @velora/api db:migrate:production
corepack pnpm --filter @velora/api exec wrangler deploy
```

Нельзя включать платные флаги, создавать packs или мигрировать production как побочный эффект
другой команды.

## Документация

- [архитектура](docs/architecture/ARCHITECTURE.md);
- [API](docs/api/API_SPEC.md);
- [deployment](docs/operations/DEPLOYMENT.md);
- [runbook владельца](docs/operations/RUNBOOK.md);
- [security review](docs/security/SECURITY_REVIEW.md);
- [актуальный статус](docs/execution/STATUS.md);
- [честный verification report](FINAL_VERIFICATION_REPORT.md).
