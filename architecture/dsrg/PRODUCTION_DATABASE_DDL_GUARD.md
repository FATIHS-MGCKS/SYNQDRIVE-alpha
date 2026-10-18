# Production database destructive-DDL guard

**Status:** PROPOSED (repository guard + deploy gates; VPS role migration not applied)  
**Last updated:** 2026-10-18  
**Clean PR:** supersedes scope-drifted draft #2077

## Purpose

Prevent Prisma reset/push, test harnesses, or deploy scripts from targeting production `synqdrive` or accepting empty/stub backups before `prisma migrate deploy`.

## P1 — Identity contract

- Contract: `backend/scripts/ops/contracts/production-database-identity.v1.json`
- Library: `backend/scripts/ops/lib/production-database-identity-guard.lib.sh`
- Compares **independently**:
  - Runtime `DATABASE_URL` vs `SYNQDRIVE_MIGRATION_DATABASE_URL` / `DIRECT_URL`
  - Live PostgreSQL session (`current_database()`, database OID, `inet_server_port()`)
  - Backup `pg_dump` target name vs DSN database component
- **No** self-comparison of the same URL string.
- Migration authority **stamp** (`migration-authority.stamp`): HMAC-SHA256(body) over `oid|db|ledger|issued` after live preflight — required for production `migrate deploy` (not flag-only).

## P2 — Prisma fence

- `prisma-cli-guard.mjs` + `prisma-with-guard.sh`
- Production VPS: blocks `migrate reset`, `migrate dev`, all `db push`, destructive `db execute`
- `migrate deploy`: deploy authority flag **plus** valid stamp file
- `migrate resolve`: only with `SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED=1` and **without** deploy migration authority
- Rejects non-`public` `--schema` / datasource schema on production name
- CI: `verify-unguarded-prisma-invocations.sh` fails raw `npx prisma migrate` in `scripts/ops`

## P3 — Role separation (documented + isolated test only)

### Production read-only snapshot (2026-10-18)

| Item | Value |
|------|--------|
| Schema `public` owner | `pg_database_owner` (PG16) |
| Table owners | ~450 × `synqdrive`, rare `postgres` |
| `synqdrive` | `CREATE` on DB + schema; not superuser |
| Extensions | inspect before migration (`\dx`) |

### Target model (no mass `ALTER TABLE … OWNER TO synqdrive` after migrate)

**Do not** extend `pg-fix-app-table-ownership.sql` to re-own all tables to the app role — that restores DROP capability on production objects.

1. **`synqdrive_migrate`**: runs `prisma migrate deploy`; owns **new** migration artifacts (`_prisma_migrations` rows, new tables/indexes from DDL).
2. **`synqdrive` (app)**: `CONNECT`, `USAGE` on `public`; `SELECT/INSERT/UPDATE/DELETE` on data tables via grants; **not** owner of schema or migration-created objects.
3. **Existing tables** today owned by `synqdrive`: phased plan — create migrate-owned shadow schema or transfer ownership to `synqdrive_migrate` with explicit `GRANT` to app (never back to app ownership for DDL-bearing objects).
4. **Sequences**: `USAGE, SELECT` to app; owner `synqdrive_migrate`.
5. **Default privileges**: `ALTER DEFAULT PRIVILEGES FOR ROLE synqdrive_migrate IN SCHEMA public GRANT … TO synqdrive`.
6. Optional **event trigger** blocking `DROP SCHEMA` / `DROP DATABASE` except `synqdrive_migrate` / `postgres`.

Validated in CI via simulated role (`guard_test_app` + `REVOKE CREATE`) — not on VPS.

## P4 — Deploy / backup gate

`vps-deploy-release.sh`: live preflight → `pg_dump` + size/gzip checks → backup COPY content gate → clone → stamp → `migrate deploy`.

## P5 — Bootstrap first protected deploy

Executor on `d43ff450` lacks guard files. **Approved path** (no CI skip, no ad-hoc copy):

```bash
SYNQDRIVE_GUARD_BUNDLE_INSTALL_AUTHORIZED=1 \
  bash backend/scripts/ops/vps-production-database-guard-install-verified-bundle.sh \
  /opt/synqdrive/current/backend/scripts/ops
```

- Manifest: `production-database-guard-bundle.manifest.sha256`
- Installs only listed paths after per-file SHA-256 verification
- Does **not** deploy application code
- Next `vps-deploy-release.sh` run uses installed preflight before any migration

## P6 — Ledger parity

`prisma-migration-history-name-parity.sh` — 435 rows = 419 successful distinct + 16 rolled back; folder tree count differs (historical VPS tail).

## Validation

```bash
cd backend && npm run test:production-database-guard:entrypoints
cd backend && npm run test:production-database-guard   # requires CI postgres
```
