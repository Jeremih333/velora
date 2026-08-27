# Lorebook architecture

Lorebooks and entries are persisted in D1 and attached through authorized relationships. During prompt assembly, normalized Unicode keys are matched against the bounded conversation context. Matching entries are ordered by priority and constrained by both per-entry and aggregate token budgets.

## Invariants

- Disabled or unauthorized lore never reaches a prompt.
- Keys are data, not regular-expression or template code.
- One entry is emitted at most once per assembly.
- Stable ordering is priority, explicit position, then deterministic identifier tie-break.
- The inspector reports fired keys, priority and tokens using the same assembly result.
- Editing a lorebook affects subsequent generations without rewriting past generations.

The executable implementation is covered by `packages/ai` and prompt quality tests plus Worker/D1 and browser integration.
