# POST-P6-P12 — Fresh DB migration recovery (greenfield bootstrap)

**Date:** 2026-11-20 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_P12_FRESH_DB_MIGRATION_RECOVERY`  
**Base `origin/main`:** `b29d9fd89b0ce26a52d8edda6b6e12260dc68f4c6`  
**Mode:** disposable localhost PostgreSQL only; **no** production writes; **no** historical migration SQL edits.

---

## Root cause

| Field | Value |
|-------|-------|
| Failing migration | `20260413230000_add_composite_indexes_batch_c` |
| Error | `SQLSTATE 25001` — `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` |
| Prisma version | **5.22.0** (`prisma` + `@prisma/client`) |
| PostgreSQL (agent disposable) | **16.15** @ `127.0.0.1:5433` |
| Index statements | **14** `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (migration SQL unchanged) |

`prisma migrate deploy` applies each migration inside a transaction. Postgres rejects `CREATE INDEX CONCURRENTLY` in that context. The migration file comment claiming Prisma does not wrap migrations in `BEGIN/COMMIT` is **incorrect** for `migrate deploy`.

**Historical migration changed:** **NO** (byte-for-byte preserved on disk).

---

## Native vs recovery-assisted bootstrap

| Path | Result on empty disposable DB |
|------|--------------------------------|
| `npx prisma migrate deploy` (unassisted) | **FAIL** at `batch_c` (25001) |
| `SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1` + `scripts/test/greenfield-disposable-migrate-recovery.sh` | **PASS** — full chain through 452 folder migrations |

The greenfield runner sets `PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1` and delegates to `prisma-migrate-deploy-resilient.sh`, which:

1. On `batch_c` 25001: runs `apply-composite-indexes.ts` (non-transactional `$executeRawUnsafe` per statement)
2. Runs `verify-composite-indexes-batch-c.ts` (14 indexes, `indisvalid`)
3. `prisma migrate resolve --applied` **only after** verification
4. Resumes `migrate deploy`

**Additional greenfield-only recoveries (pre-existing resilient paths, not new SQL edits):**

- `20260721270000_iam_role_assignment_drift_reconciliation` — empty-DB identifier collision → `apply-m252-ephemeral-recovery.ts` + parity check + resolve
- `20260816110731_ci_r3b_production_history_tail_reconciliation` — duplicate M252 after ephemeral DDL → parity check + resolve

---

## Safety guards (implemented)

| Guard | Location |
|-------|----------|
| Explicit opt-in | `SYNQDRIVE_GREENFIELD_MIGRATE_RECOVERY=1` |
| Disposable DB allowlist | `greenfield-disposable-migrate-recovery.sh` + `production-database-identity-guard.lib.sh` |
| Localhost-only | ephemeral profile asserts `127.0.0.1` / `localhost` |
| Empty DB preflight | `SYNQDRIVE_GREENFIELD_REQUIRE_EMPTY_DB=1` (default) |
| Fail-closed on unknown errors | resilient script exits without resolve |
| No production profile | `PRISMA_MIGRATE_EPHEMERAL_RECOVERY` blocked unless ephemeral guard passes |

---

## End-to-end validation (agent run)

**Database:** `synqdrive_p12_greenfield_cert` (dropped/created empty before run)

| Check | Result |
|-------|--------|
| A. Empty DB starts migrate | **PASS** (then fails at `batch_c` on first unassisted deploy — reproduced separately) |
| B. `batch_c` reconciled | **PASS** (apply + verify + resolve) |
| C. Remaining migrations | **PASS** (452 migrations in folder) |
| D. `prisma migrate status` | **Database schema is up to date!** |
| E. Idempotent redeploy | **No pending migrations to apply** |
| F. Migration checksum (`batch_c` applied row) | `315ea75619f33af2d3cdd4e61744aa916e461232bcc203738f1eae9c1fae4496` (on-disk migration folder unchanged) |
| G. `core_app_service_clients` | **present** |
| H. `core_app_service_org_grants` | **present** |
| I. `organization_products`, `vehicle_product_grants` | **present** |
| J. P11 HTTP Postgres (3 tests) | **3/3 PASS** on greenfield DB + **3/3 PASS** on `synqdrive_product_catalog_p2_pr1` (regression) |
| K. Production impact | **NONE** |

**History rows:** `_prisma_migrations` contains rolled-back failed attempts for `batch_c`, M252, and tail reconciliation plus successful applied rows (455 total rows, 452 successful applied migrations matching folder count).

**Artifact log:** `/opt/cursor/artifacts/p12-greenfield-migrate.log` (agent environment).

---

## Operational limitations

- Production and long-lived databases must **not** use this greenfield runner; existing populated DBs are out of scope (no reset).
- Unassisted `prisma migrate deploy` on a **brand-new** database remains **broken** at `batch_c` until a product-level Prisma/Postgres strategy changes or an operator uses the recovery-assisted path.
- Ephemeral M252/tail recoveries are **greenfield-only** (`PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1`); not enabled on production deploy scripts.

---

## Changed artifacts (P12 scope)

| File | Role |
|------|------|
| `backend/scripts/test/greenfield-disposable-migrate-recovery.sh` | Opt-in greenfield runner |
| `backend/scripts/test/verify-composite-indexes-batch-c.ts` | Post-apply index verifier |
| `backend/scripts/test/prisma-migrate-deploy-resilient.sh` | Verify before `resolve` on `batch_c` |
| `backend/src/modules/core-app-m2m/testing/core-app-m2m-disposable-postgres-preflight.ts` | Allow `synqdrive_p12_*` / `synqdrive_greenfield_*` for P11 retest on bootstrapped DB |

---

## P12 independent security review (2026-11-20)

| Control | Verdict |
|---------|---------|
| F1 index integrity | **PASS** — 14/14 btree columns/order, non-unique, non-partial, valid (`verify-composite-indexes-batch-c.ts`) |
| F2 DB preflight | **PASS** — opt-in, localhost guard, allowlist, connect probe, populated `_prisma_migrations` refused; **`SYNQDRIVE_GREENFIELD_REQUIRE_EMPTY_DB=0` removed** |
| F3 recovery entrypoint | **PASS** — `recover_special_composite_index` now requires `PRISMA_MIGRATE_EPHEMERAL_RECOVERY=1` (parity with M252/tail) |
| F4 greenfield cert | **PASS** — `synqdrive_p12_review_cert`, 452 migrations, idempotent replay, checksum unchanged |
| F5 regression | **PASS** — guard bundle manifest refreshed; no `prisma/migrations/*` diff; P11 3/3 |

**Confirmed defects remediated in review:**

1. Index verifier checked presence only — added definition parity (btree column order, uniqueness, partial predicate).
2. Greenfield empty-DB override could bypass populated-DB guard — removed.
3. Empty-DB `CASE` SQL could error on missing table — split into metadata `EXISTS` + conditional count.
4. `batch_c` recovery lacked ephemeral gate — aligned with approved ephemeral-only recovery contract.

**Selftest:** `backend/scripts/test/greenfield-disposable-migrate-recovery-preflight.selftest.sh`