# BotHub roleplay model catalog

Checked against the official public BotHub catalog and all 498 entries in the authenticated
production key-scoped `/models` state on 24 August 2026. Public prices and availability are
volatile; the runtime intersects this reviewed registry with the authenticated catalog and
requires a successful per-model smoke result.

| Velora ID              | BotHub ID                | Purpose                                          | Context | Output cap | Public ELITE API RUB input/output per 1M | Status                        |
| ---------------------- | ------------------------ | ------------------------------------------------ | ------: | ---------: | ---------------------------------------: | ----------------------------- |
| `velora-balanced`      | `deepseek-chat-v3.1`     | stable long-form roleplay                        | 131,072 |      1,200 |                            24.75 / 93.11 | production V3 eval completed  |
| `velora-free-roleplay` | `l3-lunaris-8b`          | low-cost model tuned for roleplay                |   8,192 |        800 |                              4.71 / 5.89 | production V3 check completed |
| `velora-free-context`  | `mistral-nemo`           | lowest-cost available multilingual context route | 128,000 |        800 |                              2.24 / 3.54 | production V3 check completed |
| `velora-llama-epic`    | `llama-3.3-70b-instruct` | cinematic multi-character scenes                 | 128,000 |      1,400 |                    runtime price ceiling | staging V3 eval completed     |

The current production key snapshot exposes `mistral-nemo`, `l3-lunaris-8b`,
`deepseek-chat-v3.1`, `kimi-k2.5`, `qwen3-8b`, `gpt-5-nano` and `gpt-5.4-mini`. GPT, rejected Qwen,
timed-out Kimi and the unavailable Chimera route are no longer part of the VeloraAI product
registry. Only the two Free profiles above have
independent completed production V3 evaluations for the Free-plan role. The additional profiles
are exposed only when the key-scoped catalog and health checks confirm them; otherwise the UI
shows them as temporarily unavailable instead of sending a doomed request. Public zero-token-price
routes remain best-effort research candidates and are not presented as guaranteed Free capacity:
BotHub documents a separate per-request LLM charge and free-route availability/model identity can
change.

The replacement candidates were selected from current official BotHub listings and checked using
the authenticated staging key on 23 August 2026. `llama-3.3-70b-instruct` completed a bounded V3
generation. `rocinante-12b` and `deepseek-r1-0528` both returned a provider 404 despite appearing
in the key-scoped catalog, so they were removed from runtime selection. `qwen3-8b` was present in the account
catalog but its bounded production eval returned `BOTHUB_FORBIDDEN`; catalog presence alone does
not make it available.

Selection is based on cost **and** roleplay utility. “Cheapest” means verified provider price per
token, not an assumption that the model inherently emits fewer tokens. `mistral-nemo` is the cheapest priced text
route in the current catalog and provides 128K context; `l3-lunaris-8b` costs slightly more but is
explicitly roleplay-oriented. Cheaper general candidates are not promoted until they pass the same
Russian continuity, character-voice, streaming and memory/lore evaluation.

The live Velora production catalog was checked on 24 August: `velora-free-context` and
`velora-free-roleplay` are both present, selectable, `available=true` and `tier=free`. The nearby
low-cost candidate `ling-3.0-flash` (2.48 / 7.42 RUB per 1M input/output tokens) remains excluded
until a bounded roleplay evaluation proves character voice, narrative continuity and lore
activation; catalog presence alone is not sufficient.

The browser receives display metadata and health/entitlement flags only. Provider IDs, prices,
budget ceilings, the API key and the master account balance remain server-side.

Official references: <https://bothub.ru/models> and
<https://bothub.ru/api/documentation/ru/generation/text-generation>, plus the official
[`mistral-nemo`](https://bothub.ru/mistral-nemo) and
[`l3-lunaris-8b`](https://bothub.ru/l3-lunaris-8b),
[ `deepseek-chat-v3.1`](https://bothub.ru/deepseek-chat-v3.1) and the official BotHub model-catalog entry
for `llama-3.3-70b-instruct`.
