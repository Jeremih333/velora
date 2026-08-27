# Roleplay model evaluations

## Admission rule

A model is selectable only when all conditions are true:

1. it is enabled in the reviewed backend registry;
2. it exists in the authenticated BotHub key-scoped catalog;
3. its own bounded smoke/eval completed successfully;
4. the user's plan permits its tier;
5. global and per-user budget guards still permit the request.

Catalog presence is not quality evidence. Marketing descriptions are not used as an eval score.

## Standard scenario set

The executable and review contract is defined in
[`ROLEPLAY_BENCHMARK.md`](./ROLEPLAY_BENCHMARK.md).

- Russian dialogue continuity and character voice;
- `{{char}}` and `{{user}}` template substitution;
- instruction hierarchy and no accidental role inversion;
- memory fact recall after irrelevant turns;
- activated lore entry versus a non-activated entry;
- branching without rewriting sibling messages;
- safe refusal boundary without breaking ordinary fictional roleplay;
- streaming protocol, usage accounting, latency and non-empty output.

Each scenario is scored for voice, coherence, instruction following, memory/lore accuracy,
formatting and latency. Prompt and generated prose are not written to operational logs.

## Current evidence

| Model                    | Catalog            | Smoke      | Standard RP suite                                               | Decision                                      |
| ------------------------ | ------------------ | ---------- | --------------------------------------------------------------- | --------------------------------------------- |
| `deepseek-chat-v3.1`     | key-scoped present | completed  | existing quality scenarios pass through mocked adapter          | enabled as stable route                       |
| `deepseek-chat-v3-0324`  | key-scoped present | completed  | 7/7 production scenarios completed; subjective review pending   | enabled Plus route; review pending            |
| `l3-lunaris-8b`          | key-scoped present | completed  | automated quality scenarios pass; subjective 1–5 review pending | enabled Free route; benchmark review pending  |
| `mistral-nemo`           | key-scoped present | completed  | automated quality scenarios pass; subjective 1–5 review pending | enabled Free route; benchmark review pending  |
| `llama-3.3-70b-instruct` | key-scoped present | completed  | seven-scenario production benchmark required                    | enabled Pro route after production checkpoint |
| `rocinante-12b`          | key-scoped present | failed 404 | not run                                                         | removed from runtime selection                |
| `deepseek-r1-0528`       | key-scoped present | failed 404 | not run                                                         | removed from runtime selection                |

The authenticated production reconciliation observed both Free candidate IDs on 22 August 2026.
Versioned `V3` bounded checks then completed independently in staging and production. Production
recorded 89 input / 64 output tokens for `l3-lunaris-8b` and 78 input / 16 output tokens for
`mistral-nemo`; both returned non-empty Russian roleplay output without leaking template markers.
This proves availability, protocol compatibility and the bounded response invariant. It does not
replace the contract's subjective 1–5 assessment for narrative and emotional quality.
The owner-only eval panel requires a separate confirmation for each real request, stores no
generated prose, and prevents a second charge for the same immutable eval version.

The production D1 evidence was read again on 23 August 2026. The most recent completed model runs
remain `deepseek-chat-v3.1`, `l3-lunaris-8b` and `mistral-nemo`. The former Qwen/Kimi/Chimera
profiles have been removed from the product registry; their replacements do not become visible
merely because their code profile exists.

No candidate may be marked production-ready by editing this document alone.

### Economical Free-plan probe — 24 August 2026

The protected key-scoped catalogue and eight real Russian roleplay requests were checked again.
The synthetic prompts contained no user data. Prices were read independently from the public
BotHub catalogue at the same checkpoint.

| Model             | Input/output RUB per 1M | Live result  | Roleplay finding                                                                   | Decision                                                   |
| ----------------- | ----------------------: | ------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `mistral-nemo`    |             2.24 / 3.54 | 2/2 HTTP 200 | actions in both replies; 320–361 characters; weaker paragraph compliance           | keep as the cheapest long-context Free option              |
| `l3-lunaris-8b`   |             4.71 / 5.89 | 2/2 HTTP 200 | actions in both replies; stronger trigger reaction; 320–505 characters             | keep as the default roleplay-oriented Free option          |
| `ling-3.0-flash`  |             2.48 / 7.42 | 2/2 HTTP 200 | strongest structure and trigger reaction, but both replies hit the 320-token bound | reserve candidate; do not silently expand Free output cost |
| `mythomax-l2-13b` |             7.07 / 7.07 | 2/2 HTTP 200 | one 51-character reply ignored the required action and character instruction       | reject for the Free selector                               |

The selected pair remains `l3-lunaris-8b` plus `mistral-nemo`: it exposes visibly different
trade-offs (roleplay voice versus long context), stays below the other reviewed candidates on
bounded output cost, is available to the current key, and is already enforced server-side in both
MainBot conversations and AvatarBot per-user resolution. `ling-3.0-flash` is not promoted merely
because its sample prose looked stronger: its two bounded samples both ended with `length`, which
would create either truncated replies or a higher Free-plan output budget.

Machine-readable evidence:

- `toolkit/free-model-cost-snapshot.json` — public catalogue price/context snapshot;
- `toolkit/free-roleplay-probe-results.json` — authenticated status, latency, token and formatting
  metrics;
- `toolkit/probe-free-roleplay-candidates.ps1` — repeatable DPAPI-backed probe that never prints the
  API key.

### DeepSeek V3 0324 production benchmark

The immutable seven-scenario production run completed on 24 August 2026. It used 514 input and
669 output tokens, produced a non-empty response for all seven scenarios, and entered
`AWAITING_REVIEW`. The conservative accounting reserve was 141001 micro-USD; it is intentionally
higher than the raw token charge because every request reserves the configured fixed provider
margin. Scenario output lengths were 134-338 characters and latencies were 4.3-7.7 seconds.

This is strong protocol, availability and bounded-output evidence. It is not silently promoted to a
subjective narrative-quality approval because the persisted audit stores hashes and metrics rather
than private generated prose. A human 1-5 review remains explicit.
