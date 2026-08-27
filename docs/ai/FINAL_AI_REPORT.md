# Velora final AI report

Verification date: 24 August 2026.

## 24 August model addendum

`deepseek-chat-v3-0324` is now an enabled Plus-level story route with a 131072-token provider
context and a 1400-token Velora output cap. It passed repeated catalogue, direct and streaming
checks, the signed Worker smoke, and all 7/7 production roleplay scenarios (514 input, 669 output
tokens). The benchmark remains `AWAITING_REVIEW`: protocol stability is proven, while private
generated prose was deliberately not persisted for an automatic subjective score.

The requested `deepseek-r1`, `deepseek-r1-0528` and `deepseek-v4-pro` routes remain hidden because
their bounded responses were inconsistent or failed the signed Worker evaluation. The two Free
routes remain `mistral-nemo` (lowest observed text cost with a large context) and `l3-lunaris-8b`
(economical roleplay-oriented alternative).

## Decision

Velora keeps `deepseek-chat-v3.1` as the stable paid roleplay route. The two economical Free-plan
candidates are `mistral-nemo` and `l3-lunaris-8b`. Catalog presence alone was not accepted: both
routes passed their own bounded production-key `V3` check before admission. The broader subjective
roleplay benchmark remains a separate quality-review checkpoint.

## Verified provider facts and product limits

| Velora route           | BotHub model         | BotHub context | BotHub maximum output | Velora maximum output | BotHub API input/output price per 1M tokens | Evidence state                         |
| ---------------------- | -------------------- | -------------: | --------------------: | --------------------: | ------------------------------------------: | -------------------------------------- |
| `velora-balanced`      | `deepseek-chat-v3.1` |        131,072 |                32,768 |                 1,200 |                           24.75 / 93.11 RUB | previously smoke-verified stable route |
| `velora-free-context`  | `mistral-nemo`       |        128,000 |                16,384 |                   800 |                             2.24 / 3.54 RUB | production V3 check completed          |
| `velora-free-roleplay` | `l3-lunaris-8b`      |          8,192 |                16,384 |                   800 |                             4.71 / 5.89 RUB | production V3 check completed          |

Prices use the currency shown by the official catalog for the checked route and date; the unit is
therefore written inside every price cell rather than implied by the column. The provider maximum
and Velora's product cap are different values. Velora deliberately limits
Free replies to 800 tokens and the stable route to 1,200 tokens. Provider prices are volatile and
were checked on the official model pages on the verification date; runtime billing never trusts
browser metadata.

`mistral-nemo` is the lowest priced text model among all 354 cards in the public BotHub catalog at
the 22 August 2026 checkpoint and supplies the larger 128K context window. `l3-lunaris-8b` is the
explicitly roleplay-oriented alternate. Cost alone does not prove roleplay quality, so neither
candidate is admitted by documentation or catalog presence alone; each passed an independent
production-key V3 eval first.

Generic zero-token-price `free` and `:free` aliases were deliberately not used as named product
models. They do not guarantee a stable underlying model or continued key-scoped availability.

## Admission and fallback

A model is available only when the reviewed registry enables it, the authenticated BotHub key
exposes it, its own immutable smoke/eval version passes, the user's plan permits it, and all budget
guards permit the request. `velora-free-context` may fall back once to
`velora-free-roleplay`; the registry rejects cycles. The stable route has no automatic cross-tier
fallback. Failures are explicit and do not silently debit a different route.

## Memory and prompt cost control

Velora uses deterministic extractive/hierarchical memory, active-branch messages and bounded lore
selection before generation. This avoids paying another model for memory maintenance and prevents
unbounded transcript replay. The requested `deepseek-v4-flash` memory route was not present in the
verified key-scoped BotHub catalog and is therefore not claimed or enabled.

## Budget and CAPS safeguards

- three sponsored Free requests per user per UTC day;
- one concurrent generation per user;
- per-user daily provider ceiling of USD 0.40;
- AvatarBot per-user ceilings of USD 0.40 Free, USD 1.20 Premium and USD 2.40 Pro daily;
- global ceilings of USD 20 daily, USD 300 monthly and USD 5000 lifetime;
- conservative fixed reserve of USD 0.02 per request in addition to estimated token cost;
- no automatic BotHub purchase, renewal or top-up;
- owner-only daily, weekly, lifetime and per-model usage aggregates, with the configured budget
  remainder; ordinary administrators cannot access the owner totals.

BotHub does not document a provider API endpoint for the account's exact remaining CAPS balance.
Velora therefore does not invent that number. The owner panel reports locally observed provider
usage and configured safeguards; the exact CAPS balance remains a BotHub-account fact.

## Remaining quality checkpoint

All three routes have bounded real-provider evidence. The Free routes are admitted with strict
budgets and explicit best-effort availability. Their standardized subjective 1–5 roleplay review
is still required before making stronger quality claims; no “uncensored” or guaranteed-quality
claim is made.

## Evidence

- Official catalog: <https://bothub.ru/models>
- `deepseek-chat-v3.1`: <https://bothub.ru/deepseek-chat-v3.1>
- `mistral-nemo`: <https://bothub.ru/mistral-nemo>
- `l3-lunaris-8b`: <https://bothub.ru/l3-lunaris-8b>
- Registry: `apps/api/src/model-registry.ts`
- Admission evidence: `docs/ai/MODEL_EVALS.md`
- Cost controls: `docs/operations/BOTHUB_COST_MODEL.md`
- Prompt and memory design: `docs/ai/PROMPT_ARCHITECTURE.md` and
  `docs/ai/MEMORY_ARCHITECTURE.md`
