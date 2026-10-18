# Production database destructive-DDL guard

**Status:** PROPOSED (repository guard + deploy gates; VPS role migration not applied)  
**Last updated:** 2026-10-18  
**Related incident:** `DROP SCHEMA "public" CASCADE` logged 2026-10-18T13:18:10Z on `synqdrive@synqdrive` (failed with out-of-shared-memory; partial schema damage followed).

## Purpose

Prevent Prisma reset/push, test harnesses, or deploy scripts from targeting the production `synqdrive` database or accepting empty/stub backups before `prisma migrate deploy`.

## P1 — Identity contract

- Versioned contract: `backend/scripts/ops/contracts/production-database-identity.v1.json`
- Library: `backend/scripts/ops/lib/production-database-identity-guard.lib.sh`
- Profiles:
  - `ephemeral` — CI/local disposable DBs; rejects reserved name `synqdrive` and production URL fragments.
  - `production_vps` — VPS deploy; requires `synqdrive` @ localhost, live schema + ledger floors, blocks recovery/cutover flags.

Numeric floors (min table count, min ledger rows) are **sanity bounds**, not business truth. Pair deploy with before/after snapshots.

## P2 — Destructive Prisma fence

- `backend/scripts/ops/lib/prisma-cli-guard.mjs` (invoked via `prisma-with-guard.sh` and `prisma:migrate:*` npm scripts)
- `backend/scripts/test/prisma-migrate-deploy-resilient.sh` routes all `migrate deploy` / `resolve` through the guard.
- Blocks: `migrate reset`, `migrate dev`, `db push --force-reset`, `db push --accept-data-loss` on production identity.
- Production `migrate deploy` requires `SYNQDRIVE_MIGRATION_AUTHORITY=1` (set only from `vps-deploy-release.sh`).

**Limitation:** Direct `npx prisma` bypass remains possible until CI grep gate fails undocumented entrypoints. App role DDL exposure requires role migration (P3).

## P3 — Role / ownership plan (not applied on VPS)

### Read-only production snapshot (2026-10-18)

| Object | Observation |
|--------|-------------|
| Schema `public` owner | `pg_database_owner` (PostgreSQL 16) |
| Table owners | ~450 tables `synqdrive`, 1 `postgres` |
| Role `synqdrive` | `CREATE` on database + schema `public`, not superuser |
| Role `postgres` | superuser (migrations / ownership fix script) |

`REVOKE CREATE ON SCHEMA public FROM synqdrive` alone **does not** remove destructive DDL for objects owned by `synqdrive` (DROP TABLE) and does not prevent `DROP SCHEMA` by schema owner (`pg_database_owner`).

### Target model

1. **`synqdrive_migrate`** (login, not superuser): runs `npm run prisma:migrate:deploy` under `SYNQDRIVE_MIGRATION_AUTHORITY=1`; owns new migration objects; member of `pg_database_owner` or explicit owner of `public` during maintenance window.
2. **`synqdrive` (app)**: `CONNECT`, `USAGE` on `public`; `SELECT/INSERT/UPDATE/DELETE` on tables; **no** `CREATE` on schema; **not** owner of tables created after cutover (migrate role owns, then `ALTER TABLE ... OWNER TO synqdrive` via existing `pg-fix-app-table-ownership.sql` extended).
3. **Event trigger (optional hardening):** reject `DROP SCHEMA`, `DROP DATABASE`, `DROP TABLE` unless `current_user = synqdrive_migrate` or `postgres`.

### Migration steps (owner GO required)

1. Create `synqdrive_migrate` with password in secrets manager (not `backend.env` app copy).
2. `REVOKE CREATE ON SCHEMA public FROM synqdrive;`
3. Re-assign table/sequence ownership batch (extend `pg-fix-app-table-ownership.sql`).
4. Update `vps-deploy-release.sh` to run `prisma migrate deploy` as `synqdrive_migrate` DSN override (single step, not app `DATABASE_URL`).
5. Verify app replicas still use `synqdrive` DSN.
6. Record in DSRG evidence.

## P4 — Deploy / backup gate

- `vps-production-database-deploy-preflight.sh` — live schema + optional backup file.
- `production-database-backup-content-gate.lib.sh` — COPY block row floors, gzip size, non-empty core tables.
- Integrated in `vps-deploy-release.sh`: pre-backup live check → pg_dump → backup content gate → migrate preflight.

## P5 — Regression

- `backend/scripts/test/production-database-guard-postgres-gate.sh`
- CI: `.github/workflows/production-database-guard.yml`

## P6 — Ledger name parity

- Script: `backend/scripts/ops/prisma-migration-history-name-parity.sh`
- Production (2026-10-18): 435 ledger rows = 419 successful distinct + 16 rolled-back attempts; release tree `d43ff450` has 402 migration folders — 17 successful ledger names not present in that tree (historical tail / reconciliations applied on VPS ahead of folder inventory). Use set diff output for promotion reviews; `migrate status` UP TO DATE is necessary but not sufficient.

## Validation commands

```bash
cd backend && bash scripts/test/production-database-guard-postgres-gate.sh
cd backend && bash scripts/ops/prisma-migration-history-name-parity.sh  # on VPS read-only
bash backend/scripts/test/verify-destructive-prisma-entrypoints.sh
```
