# Moderation policy

Сигналы: детерминированные правила, metadata/risk, необязательный classifier, жалобы и
human review. Одно неоднозначное слово не приводит к автоматическому бану.

Actions: `NO_ACTION`, `WARNING`, `CONTENT_HIDE`, `CONTENT_REMOVE`,
`TEMP_RESTRICTION`, `ACCOUNT_SUSPEND`, `ACCOUNT_BAN`, `ESCALATE`.

Каждое действие имеет actor, reason, previous/new state и append-only audit event. Moderator
видит private content только внутри конкретного разрешённого case. Appeals поддерживаются.
