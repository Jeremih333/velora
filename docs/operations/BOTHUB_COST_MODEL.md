# BotHub Free-plan cost model

Checked 24 August 2026 against BotHub's public `Individual / ELITE / API / RUB` catalog and the
498 entries exposed to the authenticated production key. BotHub lists a separate 1 RUB charge per
ordinary LLM request in addition to token usage.
The public prices are volatile and are therefore evidence for product selection, not trusted input
to runtime billing. Runtime reservations deliberately retain the larger server-owned `$0.02`
fixed-request reserve and fail closed when provider-reported cost exceeds the reservation.

Assumed active reply: 8,000 input tokens and 600 output tokens.

| Route                   | Input RUB / 1M | Output RUB / 1M | Scenario RUB | Roleplay decision                               |
| ----------------------- | -------------: | --------------: | -----------: | ----------------------------------------------- |
| `mistral-nemo`          |           2.24 |            3.54 |       1.0200 | selected Free: cheapest priced text route       |
| `ling-3.0-flash`        |           2.48 |            7.42 |       1.0243 | research candidate; RP quality not established  |
| `nex-n2-mini`           |           2.95 |           11.79 |       1.0307 | research candidate; RP quality not established  |
| `gemini-2.5-flash-lite` |           2.95 |           11.79 |       1.0307 | research candidate; RP quality not established  |
| `l3-lunaris-8b`         |           4.71 |            5.89 |       1.0412 | selected Free: explicit roleplay specialization |
| `mythomax-l2-13b`       |           7.07 |            7.07 |       1.0608 | RP candidate; separate live eval required       |

The fixed 1 RUB request component dominates these short scenarios. Picking a model with a tiny
token price does not make an unbounded conversation free: the prompt branch, persistent memory,
lore and output length still need strict budgets.

The number of input tokens is governed mainly by Velora's prompt, active branch, memory and lore
selection—not by choosing a cheaper model. The Free trial therefore applies all of these controls:

- two reviewed Free-tier candidates, selectable only after per-model health proof;
- maximum 800 output tokens;
- three sponsored requests per user per UTC day;
- one concurrent generation per user across all conversations;
- a separate per-user daily provider-cost ceiling, enforced atomically with the global budget;
- per-interacting-user AvatarBot daily ceilings derived from the `$0.40` Free base:
  Free `$0.40`, Premium `$1.20`, Pro `$2.40`;
- global daily `$20`, monthly `$300` and lifetime `$5000` fail-closed provider budgets;
- AvatarBot usage is attributed to the interacting Telegram ID, never pooled under the bot owner;
- no user ledger debit for `SPONSORED_FREE`; paid routes still require prepaid user credits;
- no automatic BotHub purchase, renewal or top-up.

BotHub currently also lists zero-token-price aliases with `:free` / `-exp` suffixes and a generic
`free` route. They are not selected for the Velora Free plan: provider/model identity and continued
API availability are best-effort, while every visible Velora model must pass a key-scoped catalog
check and its own immutable smoke/eval. They remain research candidates only.

At the current global daily ceiling, the theoretical upper bound remains roughly 37 fully reserved
requests before other usage and retry reserve. It is a safety limit, not a service promise.

“Least expensive” in this document means the lowest verified price per token. It does not mean
that a model inherently consumes fewer tokens for the same prompt: input usage is driven mainly by
the active branch, memory and selected lore, while output usage is bounded by Velora.

The 24 August production verification confirmed that both selected Velora profiles are present,
`available=true` and `tier=free`: `velora-free-context` (`mistral-nemo`) and
`velora-free-roleplay` (`l3-lunaris-8b`). `ling-3.0-flash` remains a cost-competitive research
candidate, but it is not promoted until it passes the same bounded Russian roleplay and lore tests.

Official reference: <https://bothub.ru/models>.
