# Deployment

1. Run `toolkit/verify.ps1` and E2E.
2. Export the target D1 database into `toolkit/backups/`.
3. Apply pending migrations to staging and run integrity/smoke tests.
4. Deploy `velora-staging`; verify auth, DB, Telegram fixture and AI mock/live-budgeted check.
5. Human production gate.
6. Apply backward-compatible production migrations, deploy `velora-app`, smoke `/health`,
   `/ready`, static assets and critical API authorization.
7. Record Worker version, migration list and hashes in `docs/FINAL_VERIFICATION.md`.

Rollback uses the previous Worker deployment; database changes must remain compatible. Destructive
migrations require a separately tested restore plan.
