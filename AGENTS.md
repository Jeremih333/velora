# Velora agent map

Velora — отдельная Telegram Mini App-платформа для AI roleplay. Этот репозиторий и
Cloudflare-ресурсы `velora-*` полностью изолированы от RoleMate.

## Перед кодом

1. Прочитать относящиеся документы в `docs/`.
2. Проверить `docs/execution/TASKS.md` и `STATUS.md`.
3. Изучить существующую реализацию и acceptance criteria.
4. Запустить `toolkit/assert-boundary.ps1`.

## Инварианты

- TypeScript только `strict`; `any`, `eval`, динамический SQL и секреты в коде запрещены.
- Telegram identity принимается только после server-side проверки `initData`.
- D1 — source of truth; каждый schema change проходит неизменяемой миграцией.
- AI, платежи, кредиты и фоновые jobs идемпотентны и имеют бюджетные пределы.
- Cloudflare остаётся на Free plan: нет платных bindings, карты и автоматического upgrade.
- AI credits приобретаются только разово; auto top-up запрещён.
- Цифровые покупки внутри Telegram — только разовые invoices в Stars (`XTR`), без auto-renew.
- Private chat bodies не попадают в operational logs.
- Нельзя выдавать mock за production-реализацию или отключать тест ради зелёного CI.
- RoleMate нельзя читать как dependency, копировать или изменять из этого проекта.

## Архитектура

- `apps/api` — единый Cloudflare Worker: Hono API, Telegram webhook, static assets.
- `apps/web` — React/Vite Mini App.
- `packages/*` — domain, DB, AI, prompts, memory, moderation, billing, shared/UI.
- `migrations/` — последовательные D1 migrations.
- `tests/` — integration, contract, E2E, security и load.
- `toolkit/` — безопасные локальные команды проекта.

Подробности: [docs/README.md](docs/README.md), архитектура —
[docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md), текущая работа —
[docs/execution/STATUS.md](docs/execution/STATUS.md).

## Quality gate

```powershell
powershell -ExecutionPolicy Bypass -File toolkit/verify.ps1
```

Он включает format check, lint, strict typecheck, unit, integration, build и secret scan.
E2E запускается отдельно: `pnpm test:e2e`.
