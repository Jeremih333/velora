# RoleMate reference audit (read-only)

Date: 2026-08-09.

The owner explicitly authorised the old `C:\Users\User\Desktop\RoleMate` project as a read-only
UX and business-rule reference. RoleMate was not edited, imported as a dependency, connected to a
Velora resource or used as a source of secrets/data.

## Patterns worth adapting

- Separate moderation sections for users, public entities/content and reports.
- Owner-only sections for operations, billing, broadcasts, system settings, audit and staff.
- Server-side role hierarchy on every read/action; hiding a UI button is not authorization.
- Moderators cannot inspect or act on peer/higher staff; owners retain staff management.
- Moderator assignment/removal by Telegram ID with confirmation and immutable audit evidence.
- Per-section error boundaries, loading/error/retry states and query invalidation after mutations.
- Quick moderation behind a compact shield control to avoid accidental sanctions.
- Detailed report evidence before the decision, reason required for every action, appeal recovery.

## Velora mapping

Velora already has protected moderation queues, assignment, reasoned actions, appeals, audit and
role hierarchy. Missing UX to adapt next: a compact owner/staff section navigator, explicit
owner-only staff management, and quick moderation entry points on creator/content cards.

RoleMate concepts that do not map to Velora (questionnaires, Premium subscriptions, posting ads,
promo channels) are intentionally not copied.

## Owner identity

The previous product identity uses primary owner alias `@vldd`; additional aliases seen in the
reference were `@nuar`, `@draw` and `@monk`. Velora reserves `@vldd` as the displayed owner alias.
This does not override or fabricate the Telegram username stored from verified Telegram initData;
a separate Velora alias field must be introduced before it is shown as a clickable profile handle.
