# Staging SLO baseline and launch objectives

Updated: 2026-08-12.

## What was measured

`toolkit/slo-baseline.mjs` sends a small sequential, read-only sample only to an allowlisted local
or Velora staging origin. Production is rejected in code. It validates the response contract as
well as HTTP success for liveness, D1 readiness, public configuration and OpenAPI. Each request has
a five-second timeout; missing or malformed evidence is a failure, never a false zero.

The first staging run against Worker `eeab29c5-600b-4df8-a652-17ad773e8055` used 12 samples per
probe (48 requests total) and returned no failures:

| Probe         | Successful | p50     | p95      | max      |
| ------------- | ---------: | ------- | -------- | -------- |
| health        |      12/12 | 54.3 ms | 297.8 ms | 297.8 ms |
| ready (D1)    |      12/12 | 80.4 ms | 134.5 ms | 134.5 ms |
| public config |      12/12 | 96.4 ms | 102.7 ms | 102.7 ms |
| OpenAPI       |      12/12 | 65.4 ms | 68.7 ms  | 68.7 ms  |

This is a bounded staging baseline, not proof of production availability and not a load test. The
existing local concurrency evidence remains in [LOAD_REPORT.md](LOAD_REPORT.md).

## Provisional launch SLOs

These objectives are deliberately looser than one short staging sample and use signals already
available from the Worker/D1 operational dashboard. They become production SLOs only after launch
authorization and 30 days of production measurements.

| Category               | Provisional objective                                           | Window / action |
| ---------------------- | --------------------------------------------------------------- | --------------- |
| API availability       | at least 99.5% successful non-AI requests, excluding 4xx        | rolling 30 days |
| non-AI latency         | p95 below 750 ms for health/readiness/config                    | rolling 24 h    |
| AI generation success  | at least 97%, excluding user stop and rejected client input     | min 20 / 15 min |
| AI time to first token | p95 below 15 s while the selected provider is healthy           | rolling 24 h    |
| payment correctness    | 100% exact-once ledger grant/reversal; availability not claimed | every event     |
| data durability        | zero acknowledged writes lost; restore drill before migrations  | every migration |

The availability error budget at 99.5% is about 3 h 39 min per 30-day month. Consuming 50% of it
in seven days freezes non-reliability production changes; consuming 100% freezes all production
changes except containment and recovery. This policy cannot start until production exists and its
measurement source is verified.

Payments remain disabled, so only the exact-once correctness invariant is currently tested. AI
latency has insufficient live volume for a percentile claim; the threshold is an initial operating
objective, not observed performance. Cloudflare Free quota exhaustion is tracked separately and
must degrade explicitly rather than trigger a paid upgrade.

## Reproduction

```powershell
corepack pnpm slo:staging
corepack pnpm slo:staging -- --samples 20
```

Use 3–30 samples. Do not loop this as a synthetic load generator. Record Worker version, UTC time,
sample size and failures with every release checkpoint.

The full local gate that introduced this tool passed 129 unit/regression, 6 roleplay-quality, 4
contract and 41 integration tests plus both builds. The 12-case browser run had one unrelated
desktop shell startup timeout and passed its configured retry; the exact desktop test was then run
three times with retries disabled and passed 3/3. This is recorded as a runner flake, not hidden as
an unqualified no-retry result.
