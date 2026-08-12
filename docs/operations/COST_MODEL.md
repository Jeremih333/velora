# Cost model — BotHub capability checkpoint, 11 August 2026

## Fixed constraints

- Cloudflare remains on Workers Free and cannot auto-upgrade.
- BotHub is funded manually and only for user-visible roleplay generations.
- No automation purchases CAPS, renews a plan or enables automatic top-up.
- Memory, moderation and catalogue checks never spend prepaid roleplay CAPS.
- Prices and model availability are volatile and must be refreshed before each funding decision.

The authenticated key-scoped catalogue contains five reviewed candidates. The current selected
checkpoint model is `deepseek-chat-v3.1`; the unavailable historical
`deepseek-v3.2-speciale` is not contacted. BotHub's official model page currently lists a
131,072-token context, 24.75 ₽ per 1M input tokens and 93.11 ₽ per 1M output tokens.

The runtime retains the deliberately higher conservative ceiling of `0.41 USD` input,
`1.55 USD` output and `0.02 USD` fixed cost per request. This is a spend guard, not an exchange-rate
quote. The planning formula below uses BotHub's separately documented `1 ₽` fixed API request fee:

`1 ₽ + (input tokens × 24.75 ₽ + output tokens × 93.11 ₽) / 1,000,000`.

## Active-use forecast

Assumption: 8,000 input and 600 output tokens per successful reply. One reply is approximately
`1.254 ₽` at the current catalogue price.

| Replies/day | Replies/year | Base annual cost | With 15% reserve | Elite packs at last seen 5,500 ₽ |
| ----------: | -----------: | ---------------: | ---------------: | -------------------------------: |
|         100 |       36,500 |         45,766 ₽ |         52,631 ₽ |                    10 = 55,000 ₽ |
|         300 |      109,500 |        137,298 ₽ |        157,893 ₽ |                   29 = 159,500 ₽ |
|       1,000 |      365,000 |        457,661 ₽ |        526,310 ₽ |                   96 = 528,000 ₽ |

The owner's currently activated Elite package and 35,300,000 displayed CAPS are suitable for the
quality/accounting pilot and initial bounded usage. They are not a one-year guarantee at
100 replies/day: that scenario currently rounds to ten Elite packages after the reserve.

## Hard envelopes

Velora currently enforces a 32,000-token total context budget and an 800-token Balanced output
ceiling. A single maximum-size `deepseek-chat-v3.1` attempt is approximately `1.847 ₽`. The table
below is a planning envelope, not a promise of future provider availability or price.

| Starts/day | One attempt + 15% reserve | Two primary attempts + 15% reserve |
| ---------: | ------------------------: | ---------------------------------: |
|        100 |       77,515 ₽ / 15 Elite |               155,029 ₽ / 29 Elite |
|        300 |      232,544 ₽ / 43 Elite |               465,088 ₽ / 85 Elite |
|      1,000 |     775,147 ₽ / 141 Elite |            1,550,295 ₽ / 282 Elite |

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
[text-generation API](https://bothub.ru/api/documentation/ru/generation/text-generation).
