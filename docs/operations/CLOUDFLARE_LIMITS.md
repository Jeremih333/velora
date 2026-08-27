# Cloudflare Free operating limits

Velora is designed to run as one Cloudflare Worker with D1 as the source of truth and without a required bank card or Northflank dependency.

The current limit values are deliberately centralized in the typed capacity projection and its tests instead of copied into several documents. See [CLOUDFLARE_CAPACITY_RUNBOOK.md](CLOUDFLARE_CAPACITY_RUNBOOK.md) for the reviewed limits, reserve policy and escalation procedure.

## Release rules

- Keep at least the configured 35% operational reserve in projections.
- Never assume R2/Queues availability merely because bindings exist locally.
- D1 migrations are immutable, previewed first and accompanied by a recovery plan when data is at risk.
- Automatic paid upgrade is disabled.
- Capacity warnings block a “safe for Free” claim but do not silently mutate billing or infrastructure.
- Recheck official Cloudflare documentation before changing a stored limit or enabling a new product dependency.
