# Live Telegram Stars checkpoint

Status: `BLOCKED_HUMAN`. No live invoice is enabled or priced until the owner completes the legal
and payment checkpoint below.

The refund preflight remains live in staging Worker `a9d6eb18-7292-4cef-a5b3-0c6107fa4d11`:
owner-only initiation, payment-level idempotency, Telegram transport, entitlement reversal and
duplicate webhook reconciliation pass automated tests. `PAYMENTS_ENABLED=false`; no real Stars
were spent or refunded by this preflight.

## Why this requires the owner

Velora sells digital access and AI credits inside Telegram, so the live currency must be `XTR`.
Telegram requires delivery only after `successful_payment`, a `/paysupport` path, clear terms and
merchant responsibility for disputes and refunds. The owner must personally accept the applicable
Telegram terms and deliberately spend the test Star; automation must not do either.

Official sources:

- <https://core.telegram.org/bots/payments-stars>
- <https://core.telegram.org/bots/api#sendinvoice>
- <https://core.telegram.org/bots/api#refundstarpayment>

## Prepared minimal staging scenario

1. Owner confirms that `/terms`, `/support` and `/paysupport` content is acceptable and that
   Telegram account two-step verification is enabled.
2. In `Управление → Тарифы и разовый доступ`, create one staging-only access pack:
   - code: `STAGING_PLUS_1D`;
   - title: `Staging Plus — 1 day`;
   - price: `1 XTR`;
   - plan: `PLUS`;
   - duration: `1 day`;
   - active: yes.
3. After a fresh D1 export and green CI, explicitly change only staging
   `PAYMENTS_ENABLED` to `true` and deploy `velora-staging`.
4. Owner opens the pack in the real Telegram Mini App, confirms the displayed terms and pays the
   one-Star invoice.
5. Verify without exposing payment secrets:
   - pre-checkout was answered within Telegram's deadline;
   - one payment row reached `PAID` with `currency=XTR` and amount `1`;
   - exactly one non-renewing Plus grant exists for the matching user and invoice;
   - replay of the same Telegram update does not create another grant;
   - `/me` reports Plus and the correct expiration;
   - receipt/support UI remains reachable.
6. Call the implemented refund flow for that exact Telegram charge and verify one refund, one
   revoked access grant and no second reversal on replay.
7. Disable the pack and restore staging `PAYMENTS_ENABLED=false` unless the owner separately
   approves continued live sales.

## Pass criteria

The checkpoint passes only with the real Telegram receipt, database/payment/access consistency,
duplicate-delivery protection, refund evidence, D1 integrity and post-test disabled state. Mocked
invoice E2E remains useful regression evidence but cannot replace this live test.

## Production boundary

Passing this staging checkpoint does not authorize production deployment, production migrations,
pricing for customers or continued payment acceptance. Each remains a separate owner decision.
