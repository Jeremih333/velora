# Webhooks

Telegram posts to the fixed `/telegram/webhook` path and must pass the independently generated
`X-Telegram-Bot-Api-Secret-Token`. Security never depends on URL obscurity. `update_id` is unique
in D1; duplicate delivery returns success without repeating actions. A failed delivery remains
retryable.

For Stars, pre-checkout is accepted only when Telegram user, `XTR` currency, amount, payload and
pending state match the stored invoice exactly. `successful_payment` grants either configured
credits through an atomic append-only ledger transition or one fixed-duration plan-access grant,
and stores the unique Telegram charge ID. Duplicate delivery cannot grant twice. Recurring/
subscription fields are rejected. `refunded_payment` creates one compensating credit transaction or
revokes the linked access grant and cannot reverse twice. Entitlement is never delivered before
`successful_payment`.

Commands: `/start`, `/help`, `/app`, `/support`, `/settings`, `/terms`, `/privacy`, `/premium`,
`/report`, `/paysupport`.
