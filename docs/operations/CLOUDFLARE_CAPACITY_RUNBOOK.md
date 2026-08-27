# Cloudflare Free capacity runbook

Velora does not assume that Cloudflare Free can serve unlimited traffic. The owner dashboard shows
a conservative forecast from the previous 24 hours with a 35% reserve. It is a planning signal,
not a billing counter. The account-wide read-only guard remains the source for operational usage,
and Cloudflare **Billing > Billable Usage** plus D1 **Metrics > Row Metrics** remain authoritative.

The reviewed Free allowances are:

- Workers: 100,000 requests per day;
- D1: 5,000,000 rows read and 100,000 rows written per day; 5 GB total storage;
- Queues: 10,000 operations per day;
- R2 Standard: 10 GB-month storage, 1,000,000 class A and 10,000,000 class B operations per month.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), and
[R2 pricing](https://developers.cloudflare.com/r2/pricing/). Re-check them before changing any
constant because Cloudflare can revise limits.

## Warning response

The typed forecast has explicit 70% `WARNING`, 85% `CRITICAL`, and 95% `EMERGENCY`
thresholds. Values above 100% are `EXCEEDED`. These labels are release and operator signals; they
do not claim to be Cloudflare billing counters.

Every scheduled cycle refreshes `runtime_capacity_state`. At `CRITICAL` and above Velora stops
non-critical product-event writes, lengthens public-cache TTL and skips only optional cleanup and
provider-catalog reconciliation. User-requested memory work, account deletion, Telegram
reconciliation, operational alerts and core chat remain enabled. The database constraint fixes
`core_chat_enabled` to `1`, so conservation cannot silently turn the principal roleplay path off.
When the projection returns below 85%, the next scheduled refresh restores normal operation.

1. Compare the owner forecast with `pnpm cloudflare:usage` and the authoritative Cloudflare
   dashboard. Stop if analytics are incomplete; do not interpret missing data as zero usage.
2. Identify the limiting resource. Inspect Worker request routes, D1 row metrics/query plans,
   Queue retries and R2 storage/class A/class B operations separately.
3. Reduce demand safely: cache immutable public reads, paginate bounded queries, add or correct D1
   indexes, batch Queue work, remove retry loops, and deduplicate media. Preserve correctness and
   privacy; do not silently discard writes or user content.
4. Re-run unit, integration, load and production-like E2E gates. Confirm that degradation is explicit
   and recoverable when a quota is unavailable.
5. If the forecast still exceeds Free, pause growth-sensitive rollout and present the owner with the
   measured resource, current limit, forecast, optimization evidence and expected paid cost.

No code path, alert, forecast or script may enable billing, add a payment method, buy a plan or
upgrade Cloudflare automatically. A paid change is a separate human checkpoint and requires an
explicit owner decision after current pricing is reviewed.

R2 is currently not enabled for this account, so its forecast is forward-looking and the Telegram
file adapter remains the active media store. The forecast does not claim that R2 uploads work.
