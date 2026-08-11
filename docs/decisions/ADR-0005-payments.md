# ADR-0005: Payments

Status: implemented behind a disabled gate; live payment requires a human checkpoint.

Velora sells only one-time credit/access packs through Telegram Stars `XTR`. Subscription periods,
recurring charges and non-Telegram payment links inside the Mini App are excluded. External AI
capacity is a manual prepaid purchase with auto recharge disabled.

Pack prices are owner-configured D1 data and are not seeded by migrations. Invoice creation is
idempotent; delivery happens only after an exact `successful_payment`; refunds use a compensating
ledger entry. Both deployed environments retain `PAYMENTS_ENABLED=false` until legal text, a new
Velora bot and a deliberate live Stars smoke are approved.
