# Backup and restore

Before every production migration:

```powershell
wrangler d1 export velora-production --remote --output toolkit/backups/velora-production-<utc>.sql
```

Restore is tested against `velora-staging`, never production: create/empty an isolated staging DB,
import the backup, run `PRAGMA foreign_key_check`, `PRAGMA quick_check`, migration list and API
smoke. Telegram file IDs remain external references; missing files degrade to placeholders.

Before relying on an export, run the non-destructive isolated drill:

```powershell
node toolkit/test-restore.mjs toolkit/backups/velora-staging-pre-0020-20260811.sql
```

The drill imports into a fresh temporary local D1, applies forward migrations, checks integrity,
expects the current 58-table/22-migration contract and starts the real Worker against the restored
database. It never writes to staging or production and removes its temporary database afterwards.

D1 Time Travel Free retention is seven days, but it complements rather than replaces exports.
