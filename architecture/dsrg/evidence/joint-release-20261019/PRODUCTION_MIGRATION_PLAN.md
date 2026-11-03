# Production migration plan — target `cf20c49f`

**Read-only phase:** no `prisma migrate deploy`, no authority stamp creation, no DDL.

---

## Ledger comparison

| Source | Count / note |
|--------|----------------|
| `_prisma_migrations` finished | **424** (production) |
| Repo migration directories | **409** folders (Prisma convention; ledger can exceed due to rollbacks) |
| Migrations in git diff `c6d5ab99..cf20c49f` | **1** folder only |

---

## Pending migrations (execution order)

### 1. `20261019120000_vsi_p3a_provider_catalog_axes`

| Attribute | Detail |
|-----------|--------|
| **Source** | PR #2083 / commit `fbf0b3473` |
| **Classification** | **Additive** |
| **Objects** | Enums: `VsiProviderCatalogAxisDeclaredStatus`, `VsiProviderCatalogSnapshotCompleteness`, `VsiProviderCatalogAxisProvenance`; table `vsi_provider_catalog_axes`; indexes; FKs to `organizations`, `vehicles` |
| **Roles** | Application DB role used by Prisma migrate (existing deploy role) |
| **Compatibility with running release** | Safe — new table; no change to existing S4/DTC/trip tables |
| **Lock / duration risk** | Low — single DDL transaction; enum + one table |
| **Prisma validate** | **PASS** (`npm run prisma:validate` on workspace @ `cf20c49f`) |
| **PostgreSQL tests** | `vsi-p3a-per-link-catalog.postgres.integration.spec.ts`, concurrency spec on `main` CI |

**VSI_P3A_MIGRATION:** `20261019120000_vsi_p3a_provider_catalog_axes` — **PENDING**

---

## Migrations already in production (not re-run)

Recent ledger tail (finished, not rolled back):

- `20261017203000_di_v0_s4_research_runs_idempotency_fix`
- `20261017194500_di_v0_s4_research_outbox_intent_v2`
- `20261017183000_di_v0_s4_research_v1`
- `20261017060000_battery_hv_r22_revalidation_checkpoint`
- … (see production `_prisma_migrations` ORDER BY `finished_at` DESC)

S4 research schema from giant deploy is **IN_PROD**; this release adds **no** further S4 migrations.

---

## Execution path (after owner GO only)

1. `vps-deploy-release.sh` with `SYNQDRIVE_REQUESTED_DEPLOY_SHA=cf20c49f6596589a56eae346b5550f0b662c46b6`
2. Pre-migration **fresh** `pg_dump` + gzip + capture sidecar
3. Backup **content gate** (PG16-aware verifier on target release)
4. `export SYNQDRIVE_MIGRATION_AUTHORITY=1`
5. `npm run prisma:migrate:deploy` via **guarded** Prisma CLI
6. `pdb_guard_consume_migration_authority_stamp`
7. `pg-fix-app-table-ownership.sql`

**Forbidden:** `migrate reset`, `migrate dev`, `db push`, ad-hoc DDL, stamp creation during read-only audit.

---

## Rollback note

Applying `20261019120000_*` is **forward-only**. Application rollback to `c6d5ab99` **does not** drop `vsi_provider_catalog_axes`. New table is unused while VSI P3A flags are off.

**PENDING_MIGRATIONS:** `20261019120000_vsi_p3a_provider_catalog_axes`
