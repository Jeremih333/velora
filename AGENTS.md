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

## Visual release contract

VISUAL VERIFICATION IS MANDATORY.

Never claim that a UI feature is verified based solely on source-code
inspection.

For visual work you must:

1. run the real application;
2. open it in Playwright;
3. reproduce the target state through user interactions;
4. capture a screenshot;
5. compare it to the approved reference/baseline;
6. inspect actual/expected/diff;
7. test the visible controls;
8. inspect console and failed network requests;
9. fix discrepancies;
10. rerun until passing.

Never update snapshots only to silence a failure.

FUNCTIONAL PARITY IS NOT VISUAL PARITY.

VISUAL PARITY IS NOT FUNCTIONAL PARITY.

BOTH ARE REQUIRED.

Any clickable-looking control that does nothing is a release-blocking defect.

Any core state that exists only in temporary frontend state and is expected
to survive reload is an incomplete implementation.

Never expose BotHub, Telegram Bot or infrastructure secrets to browser code.

Do not sacrifice user-maintained memory to automatic summarization.
Manual/pinned context is user-owned persistent data.

The Lorebook feature is not complete until deterministic activation can be
demonstrated in Prompt Inspector and tested end-to-end.

`{{char}}` and `{{user}}` support is not complete until template tests pass in
all template-aware fields and neither token leaks into final rendered chat.

Regenerate and Edit must preserve branch history rather than silently
destroying previous messages.

Free Cloudflare infrastructure is a constraint, not an excuse for silent
data loss or broken UX. When capacity approaches a hard limit, detect it,
surface it to administrators and degrade non-critical functionality first.

A frontend task is NOT complete because JSX compiles.

Any visual or interactive task requires running the real application
in a browser and verifying the result.

Never report VERIFIED based only on source-code inspection.

For every affected screen:

- reproduce the state,
- interact with it,
- capture it,
- compare it,
- test it,
- inspect console/network,
- fix discrepancies,
- repeat.

A task cannot be marked DONE if:

- a required control has no real action;
- any affected E2E test fails;
- visual regression is unexplained;
- mobile layout has overflow;
- console contains unexplained errors;
- template variables leak into rendered output;
- Markdown renders raw unintentionally;
- memory loses manual user content;
- lore activation is incorrect;
- duplicate generations are possible;
- credentials are exposed client-side.

## Release status vocabulary

Use only these implementation/release evidence levels:

- `NOT_IMPLEMENTED` — the required behavior is absent;
- `IMPLEMENTED` — code exists, but the required functional and visual evidence is incomplete;
- `FUNCTIONALLY_VERIFIED` — behavior, failure paths and persistence are covered by passing tests;
- `VISUALLY_VERIFIED` — the production-like build was inspected at every affected viewport with no
  unexplained visual or accessibility regression;
- `PRODUCTION_VERIFIED` — the exact released version passed the production checks that the
  requirement explicitly needs.

`DONE` is allowed only when `FUNCTIONALLY_VERIFIED`, `VISUALLY_VERIFIED` and
`RELEASE_GATES_PASS` are all true. `PRODUCTION_VERIFIED` is additionally required whenever the
acceptance criterion is about live production behavior.

## Defect severity

- `Sev-1`: authentication bypass, secret exposure, duplicated payment, data loss or arbitrary
  account access. Every release is blocked.
- `Sev-2`: broken chat, corrupted memory, incorrect Lorebook activation, wrong `{{user}}` identity,
  broken Telegram Back navigation, inaccessible composer or duplicate paid AI generation. Every
  release is blocked.
- `Sev-3`: significant visual regression, broken responsive screen or important clipped text. Fix
  before a normal release unless the owner explicitly accepts the documented divergence.

Do not lower severity merely because a defect is difficult to reproduce. Record the reproduction,
affected version, containment and regression evidence.
