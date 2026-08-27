# UI copy catalogue

The executable localized copy lives in `apps/web/src/i18n.tsx`. This catalogue controls tone and terminology; it does not duplicate every runtime string.

| Concept               | Russian canonical term    | English canonical term    |
| --------------------- | ------------------------- | ------------------------- |
| Character             | Персонаж                  | Character                 |
| Persona               | Персона пользователя      | Persona                   |
| Lorebook              | Лорбук                    | Lorebook                  |
| Roleplay conversation | История / ролевая история | Story / roleplay story    |
| Model                 | Модель                    | Model                     |
| Memory                | Память                    | Memory                    |
| Generation credits    | CAPS / кредиты генерации  | CAPS / generation credits |
| Fixed access period   | Доступ на N дней          | N-day access              |

## Rules

- Russian is natural product copy, not a machine-like transliteration.
- Provider limitations are stated plainly; Velora never promises an “uncensored” model without controlled evidence.
- Paid actions state the exact currency and fixed duration. Digital Premium inside Telegram uses Stars only.
- Errors explain what happened and the next safe action without exposing stack traces, provider payloads or secrets.
- Empty states distinguish “nothing exists” from “filters returned nothing” and offer the relevant recovery action.
