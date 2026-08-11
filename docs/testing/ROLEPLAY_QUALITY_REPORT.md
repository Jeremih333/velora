# Roleplay quality verification

Updated: 2026-08-12.

## Structural corpus

The mandatory `pnpm test:roleplay-quality` gate runs six typed scenarios through the same
`activateLore` and `buildRoleplayPrompt` functions used by inference. It performs no provider
request and spends no BotHub CAPS.

| ID  | Scenario                          | Verified invariants                                                   |
| --- | --------------------------------- | --------------------------------------------------------------------- |
| A   | Simple English                    | character, persona, scenario and selected branch are present          |
| B   | Russian roleplay                  | Unicode character/persona/memory and recent Russian dialogue survive  |
| C   | Large definition                  | essential definition remains bounded by the declared context budget   |
| D   | Multiple lore entries             | deterministic relevant entries activate; unrelated sentinel is absent |
| E   | Heavy `{{char}}` / `{{user}}` use | nested documented variables resolve across prompt layers              |
| F   | 360-message conversation          | memory and newest branch survive while old history is dropped         |

Every case also asserts the reserved output budget, inspector/token equality and absence of
unknown template variables. A dedicated regression proves recursive templates terminate safely,
preserve escaped literals and do not evaluate arbitrary tokens.

## Live staging conversation

After the immutable provider checkpoint and explicit staging enablement, the owner completed a
real conversation through the Telegram Mini App and confirmed that the assistant response rendered
in the chat. The corresponding private conversation text was not read or copied into operational
evidence. Read-only D1 verification established the following non-content facts:

- model `deepseek-chat-v3.1`, request/generation/message state `COMPLETED`;
- 413 input tokens, 33 output tokens, 84-character persisted output and 7,080 ms latency;
- one and only one linked `GENERATION_USAGE` charge;
- user and provider accounting both finalized at 20,221 conservative USD micros.

This proves the production request path from Telegram-authenticated UI through streaming,
persistence and single-charge accounting on staging. It is one real Russian roleplay sample, not a
statistically broad prose-quality evaluation.

## Honest boundary

This suite proves deterministic context assembly, selection and budgeting. The separate immutable
owner-authorized V3 provider checkpoint completed once with `deepseek-chat-v3.1`, HTTP 200, 42
input tokens and 20 output tokens. Its short bounded response proves provider availability and the
wire protocol, not broad prose quality across all A-F scenarios. Paid roleplay is enabled only on
staging; payments and production paid AI remain disabled.
