# Roleplay quality verification

Updated: 2026-08-11.

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

## Honest boundary

This suite proves deterministic context assembly, selection and budgeting. It cannot prove prose
quality, character fidelity or provider availability without asking the selected model to answer.
That final model-quality checkpoint is intentionally pending and may run once only after the owner
sends the exact confirmation phrase `ПОТРАТИТЬ 1 ЗАПРОС V3`. Paid AI and payments remain disabled.
