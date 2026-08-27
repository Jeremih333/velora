# Release blocker audit

Updated: 25 August 2026.

## Automated blocker checks

The current-tree release gate passed the implemented scope for visible controls, sanitized Markdown,
template substitution, Persona-bound prompting, immutable branch edits/regeneration, memory
preservation, deterministic Lorebook activation, idempotent send/payment mutations, secret
scanning, keyboard composer containment, mobile horizontal overflow, Telegram BackButton handling,
unexpected console/network errors and safe API failures. The latest evidence includes 332 unit and
regression tests, 126 integration tests, the complete no-retry 46-state journey on iPhone, Android,
tablet and desktop, strict TypeScript, ESLint, Prettier, build and secret scan. No open Sev-1 or
Sev-2 was found in that automated scope.

## Open completion blockers

| Blocker                         | Safe current behavior                                                                                                                                                                                     | Evidence needed to close                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Exact visual approval           | All 46 expected/actual/diff triplets remain available; unapproved rows stay failed instead of silently replacing baselines.                                                                               | Reviewed canonical approval for every row and required viewport.                                                  |
| Real Telegram device matrix     | Production remains usable, while automated iPhone/Android/desktop coverage substitutes for no human claim.                                                                                                | Current-build Android, iOS and Web passes recorded in `FINAL_HUMAN_DEVICE_PASS.md`.                               |
| Additional model admission      | `deepseek-chat-v3-0324` passed the signed Worker eval and 7/7 benchmark scenarios. DeepSeek R1 variants, V4 Pro, Qwen/Rocinante and Kimi failures remain disabled; no request is silently routed to them. | A key-scoped catalogue match plus a separate bounded generation eval for each additional immutable model version. |
| Production image object storage | Telegram file identifiers and local R2 abstraction remain the verified fallback.                                                                                                                          | Enable R2 on the Cloudflare account, then perform production upload/read/delete/erasure evidence.                 |
| Live Stars purchase             | Stars checkout is enabled with server-side validation and idempotency, but no fake receipt is used as proof.                                                                                              | Owner-authorized real Stars receipt, ledger/access consistency and refund checkpoint.                             |

These are blockers to the full master-contract completion claim, not permission to weaken or hide
the relevant features. Production gates remain fail-closed until their corresponding evidence is
recorded.
