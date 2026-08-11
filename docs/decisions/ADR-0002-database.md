# ADR-0002: Database

Status: accepted, 2026-08-09.

Use new isolated D1 databases `velora-staging` and `velora-production`, Drizzle types and immutable
SQL migrations. Prepared statements, constraints and cursor queries keep row scans inside Free
limits. Large media stays outside D1. No RoleMate database or service binding is reused.
