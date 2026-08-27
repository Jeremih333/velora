# Premium / Pro pricing baseline

Reviewed: 2026-08-21. User-facing credits are removed. The server still records provider usage,
enforces fair-use and stops generation before the shared BotHub budget can be overrun.

## Formula

For a plan period:

`provider cost = requests × fixed request cost + input tokens × input rate + output tokens × output rate`

The retail Stars price additionally covers a conservative provider-price reserve, Telegram/Stars
conversion variance, taxes and operating margin. It must be re-reviewed against actual 30-day
cohorts before raising fair-use. No UI may call a plan unlimited.

## Launch catalogue

| Plan    |   Period | Stars | Fair-use requests/day | Access                                 |
| ------- | -------: | ----: | --------------------: | -------------------------------------- |
| Free    |  ongoing |     0 |                    30 | economical Free models                 |
| Premium |  30 days |   599 |                   150 | Free + Premium models                  |
| Premium | 365 days | 5,990 |                   150 | same access, annual discount           |
| Pro     |  30 days | 1,499 |                   500 | all reviewed models + group AI avatars |
| Pro     | 365 days | 9,999 |                   500 | same access, annual discount           |

The limits are hard server policy, not balances sold to the user. Global daily/monthly/lifetime
provider budgets remain an independent circuit breaker. When actual median input/output token use
is known, prices and limits must be recalculated from production cost telemetry rather than guesses.

## Payment channels

- Telegram digital access: Telegram Stars (`XTR`) only.
- Monthly and annual launch products are one-time prepaid periods; no silent renewal.
- A recurring 30-day Stars subscription is technically possible, but requires a separate live
  renewal/cancellation/refund acceptance run before activation.
- YooMoney Wallet API is reserved for a later external-web flow. It is not exposed as an in-MiniApp
  alternative for Telegram digital goods.
