# Standardized roleplay benchmark

Status: implementation contract for the remaining model-quality checkpoint.

## Purpose

The bounded provider check proves availability and protocol compatibility. It does not prove
narrative quality. A model receives a reviewed roleplay decision only after this benchmark and an
owner review with scores from 1 to 5.

## Scenarios

The benchmark uses short, versioned prompts and a strict combined output budget:

1. Russian character voice and emotional continuity;
2. English character voice and verbosity control;
3. persona adherence without role inversion;
4. recall of one manual-memory fact after irrelevant context;
5. activation of one matching lore entry while excluding a non-matching entry;
6. formatting and repetition control;
7. consensual mature fictional compatibility using adult characters and provider-permitted content.

The mature scenario must never include minors, coercion or a request to bypass provider safety.

## Scores

The owner records integer scores from 1 to 5 for:

- character adherence;
- persona adherence;
- narrative quality;
- Russian quality;
- English quality;
- emotional continuity;
- memory use;
- lore use;
- formatting;
- repetition control;
- verbosity control;
- latency;
- cost;
- consensual mature fictional compatibility.

Availability, token counts, latency and cost are measured by the server. Narrative scores are never
fabricated from an HTTP 200 response.

## Privacy and accounting

- benchmark execution is owner-only and requires explicit confirmation of the exact request count;
- each model and benchmark version is idempotent, preventing accidental duplicate spend;
- generated samples are returned only in the immediate authenticated response for human review;
- D1 stores scenario identifiers, output hashes, lengths, token usage, latency, cost and the submitted
  scores, but not generated prose;
- operational logs contain no prompts or outputs;
- an incomplete or failed scenario cannot produce an approved decision;
- model availability remains best-effort and is rechecked against the authenticated BotHub catalog.

## Decision states

```text
NOT_RUN -> RUNNING -> AWAITING_REVIEW -> APPROVED | REJECTED
                   -> FAILED
```

Only `APPROVED` permits strong product quality claims. A bounded smoke may still admit an economical
Free route with conservative wording, explicit fair-use guards and no “uncensored” claim.
