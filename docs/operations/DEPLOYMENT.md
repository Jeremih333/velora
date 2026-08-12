# Deployment

1. Run `toolkit/verify.ps1` and E2E.
2. Export the target D1 database into `toolkit/backups/`.
3. Apply pending migrations to staging and run integrity/smoke tests.
4. Deploy `velora-staging`; verify auth, DB, Telegram fixture and AI mock/live-budgeted check.
5. Human production gate.
6. Run the read-only commands in `PRODUCTION_PREFLIGHT.md`; install independent production
   secrets through hidden prompts only after owner authorization.
7. Apply backward-compatible production migrations, deploy `velora-app`, smoke `/health`,
   `/ready`, static assets and critical API authorization while both paid gates stay disabled.
   The guarded implementation is `toolkit/deploy-production-phase1.ps1`; its first deploy uploads
   all production secrets with the Worker version and deliberately does not change Telegram.
8. At a separate final checkpoint, move the single `@aivel0ra_bot` webhook from staging to
   production and verify `/start` plus real Mini App authentication.
   Use `toolkit/cutover-production-telegram.ps1`; it preserves session/BotHub secrets and contains
   a staging rollback path. Follow the displayed one-time owner `/start velora_smoke_…` command and
   open the Mini App within five minutes; missing either owner marker or the new production session
   rolls the webhook back to staging.
9. Record Worker version, migration list and hashes in `docs/FINAL_VERIFICATION.md`.

Rollback uses the previous Worker deployment; database changes must remain compatible. Destructive
migrations require a separately tested restore plan.
