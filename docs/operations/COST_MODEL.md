# Cost model — BotHub annual roleplay envelope, 12 August 2026

## Fixed constraints

- Cloudflare remains on Workers Free and cannot auto-upgrade.
- BotHub is funded manually and only for user-visible roleplay generations.
- No automation purchases CAPS, renews a plan or enables automatic top-up.
- Memory, moderation and catalogue checks never spend prepaid roleplay CAPS.
- Prices and model availability are volatile and must be refreshed before each funding decision.

The authenticated key-scoped catalogue contains five reviewed candidates. The current selected
checkpoint model is `deepseek-chat-v3.1`; the unavailable historical
`deepseek-v3.2-speciale` is not contacted. BotHub's public model page, checked on 2026-08-12,
lists a 131,072-token context, 24.75 ₽ per 1M input tokens and 93.11 ₽ per 1M output tokens.

The runtime retains the deliberately higher conservative ceiling of `0.41 USD` input,
`1.55 USD` output and `0.02 USD` fixed cost per request. This is a spend guard, not an exchange-rate
quote. BotHub currently documents the fixed LLM API surcharge as `$0.01` per request, whereas the
model-token prices are shown in RUB. The estimator therefore requires an explicit USD/RUB reserve;
its default is a deliberately conservative `120 ₽/$`, making the fee `1.20 ₽` per request:

`($0.01 × USD/RUB) + (input tokens × 24.75 ₽ + output tokens × 93.11 ₽) / 1,000,000`.

BotHub's public offer currently shows Elite as 35,000,000 CAPS for 5,500 ₽ and says that ordinary
packages do not expire. The observed 35,300,000 account balance is not treated as a repeatable pack
size: it may include a bonus or prior balance. There is no auto-renew or automatic purchase.

## Active-use forecast

Assumption: 8,000 input and 600 output tokens per successful reply. At the conservative `120 ₽/$`
planning rate, one reply is approximately `1.454 ₽`.

| Replies/day | Replies/year | Base annual cost | With 15% reserve | Elite packs at current 5,500 ₽ |
| ----------: | -----------: | ---------------: | ---------------: | -----------------------------: |
|         100 |       36,500 |         53,066 ₽ |         61,026 ₽ |                  12 = 66,000 ₽ |
|         300 |      109,500 |        159,198 ₽ |        183,078 ₽ |                 34 = 187,000 ₽ |
|       1,000 |      365,000 |        530,661 ₽ |        610,260 ₽ |                111 = 610,500 ₽ |

The owner's currently activated Elite package and 35,300,000 displayed CAPS are suitable for the
quality/accounting pilot and initial bounded usage. They are not a one-year guarantee at even 100
replies/day: that scenario currently rounds to twelve public Elite packages after the reserve.
Because packages do not expire but provider pricing and availability can change, the safe policy is
to fund in owner-approved tranches after measuring real usage, not pre-buy a nominal year.

## Hard envelopes

Velora currently enforces a 32,000-token total context budget and an 800-token Balanced output
ceiling. A single maximum-size `deepseek-chat-v3.1` attempt is approximately `1.847 ₽`. The table
below is a planning envelope, not a promise of future provider availability or price.

| Starts/day | One attempt + 15% reserve | Two primary attempts + 15% reserve |
| ---------: | ------------------------: | ---------------------------------: |
|        100 |       85,910 ₽ / 16 Elite |               171,819 ₽ / 32 Elite |
|        300 |      257,729 ₽ / 47 Elite |               515,458 ₽ / 94 Elite |
|      1,000 |     859,097 ₽ / 157 Elite |            1,718,195 ₽ / 313 Elite |

Creative and Premium routing remain disabled until an available candidate passes its own
owner-consented quality/accounting checkpoint. No unverified fallback is included merely to make
the forecast cheaper.

## Accounting caveat

The minimal V3 checkpoint completed and was reconciled through immutable run/accounting evidence
before paid roleplay was enabled on staging. The subsequent owner-confirmed live chat produced one
and only one linked charge. Provider-reported usage is never allowed to reduce the conservative
internal reservation. Daily, monthly and lifetime provider budgets remain the authoritative
fail-closed boundary. The current external BotHub balance is intentionally not asserted here
without a fresh authenticated provider reading.

## Observed staging sample — 12 August 2026

The first owner-driven full chat used 413 input and 33 output tokens and completed in 7.08 seconds.
The runtime finalized exactly one 20,221-micro (`$0.020221`) conservative user/provider accounting
entry. This figure is dominated by the deliberately conservative fixed per-request reserve and is
not a BotHub invoice or a representative long-conversation average. The owner grant was $1,000;
after this one generation the internal balance is $999.979779. Capacity planning therefore
continues to use the 8,000-input/600-output active-use envelope above rather than extrapolating from
this short greeting.

Official references: [selected BotHub model](https://bothub.ru/deepseek-chat-v3.1),
[model catalogue](https://bothub.ru/models), and
[text-generation API](https://bothub.ru/api/documentation/ru/generation/text-generation). Current
Cloudflare Free boundaries are documented in the official
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/workers/platform/pricing/#d1) and
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) pages.
