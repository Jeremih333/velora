# Product specification

Velora — Telegram-native AI roleplay-платформа с personas, публичными/приватными
персонажами, несколькими беседами, streaming, ветвлением, безопасным Markdown,
редактируемой versioned memory и детерминированными lorebooks.

## Core outcome

Пользователь проходит проверенную Telegram-аутентификацию, выбирает persona и character,
начинает беседу, получает потоковый ответ выбранной roleplay-модели и после перезапуска
видит неизменённую историю, активную ветку, memory и настройки.

## Product boundaries

- Первые языки: русский и английский.
- Dark, AMOLED и Light темы; mobile-first Telegram Android/iOS.
- Adult-visible режим возможен только после age gate; sexual content involving minors
  запрещён без исключений.
- Hidden prompts чужих characters не раскрываются.
- AI не является источником полномочий backend.
- Cloudflare — Free plan. При исчерпании лимита система деградирует предсказуемо, а не
  создаёт платный счёт.
- AI roleplay оплачивается из заранее купленного баланса; автоматическое пополнение
  отсутствует.

## Releases

Milestones и критерии находятся в `docs/execution/MASTER_PLAN.md` и
`docs/testing/ACCEPTANCE_CRITERIA.md`.
