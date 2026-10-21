# EXP-021 S4F-5.1 — Production release delta preflight (read-only)

**Audit date:** 2026-10-01 (UTC)  
**Target deploy SHA:** `8fa531b275bc4dca02c09b279c0d2b806e544007`  
**Production SHA:** `1dd4224037a84417c5d605575bb6d288ac93184e` (`20260929224455_v4994`)  
**Scope:** Read-only — **no** deploy, migrate, env mutation, restart, S4 activation, or provider calls.

## 1. Release identities

| Field | Value |
|-------|--------|
| `CURRENT_MAIN_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` |
| `PRODUCTION_SHA` | `1dd4224037a84417c5d605575bb6d288ac93184e` |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | Same (shared `current` symlink) |
| `REPLICA_SHA_MATCH` | **YES** |
| `REPLICA_HEALTH` | **OK** (3001 / 3002) |

## 2. Repository delta (recomputed)

| Metric | Value |
|--------|--------|
| `PROD_TO_TARGET_COMMIT_COUNT` | **29** |
| `PROD_TO_TARGET_CHANGED_FILE_COUNT` | **330** |
| `NEW_PRISMA_MIGRATION_COUNT` | **2** |
| `NEW_PRISMA_MIGRATIONS` | `backend/prisma/migrations/20260930130000_vehicle_onboarding_vo2_persistence/migration.sql`; `backend/prisma/migrations/20260930140000_vehicle_onboarding_vo2_1_integrity/migration.sql` |

## 3. `_prisma_migrations` (VO2)

| Migration | State |
|-----------|--------|
| `20260930130000_vehicle_onboarding_vo2_persistence` | **NOT_APPLIED** |
| `20260930140000_vehicle_onboarding_vo2_1_integrity` | **NOT_APPLIED** |

**Active incomplete migrations** (`finished_at IS NULL AND rolled_back_at IS NULL`): **0**.

Historical **rolled-back** tombstone rows (`finished_at` null, `rolled_back_at` set): **16** (July 2026 failed attempts, superseded by later successful applies). These are **not** VO2 blockers; `prisma migrate deploy` on Production is operational today.

`FAILED_OR_PARTIAL_MIGRATION_STATE_PRESENT=NO` (no active stuck migration; VO2 pair not in failed/partial state).

## 4. VO2 data preconditions (Production)

| Check | Value |
|-------|--------|
| `PRODUCTION_VEHICLE_COUNT` | **9** |
| `PRODUCTION_VEHICLE_WITH_NULL_ORG_COUNT` | **0** |
| `PRODUCTION_DIMO_SYNTHETIC_VIN_COUNT` | **1** |
| `PRODUCTION_NONEMPTY_LICENSE_PLATE_COUNT` | **9** |
| `PRODUCTION_NULL_VIN_COUNT` | **0** |
| `ORPHAN_VEHICLE_ORGANIZATION_COUNT` | **0** |
| `EXPECTED_INITIAL_ORG_ASSIGNMENT_ROWS` | **9** (one open assignment per vehicle) |
| `EXPECTED_INITIAL_PLATE_ASSIGNMENT_ROWS` | **9** (all vehicles have non-empty plate) |

No data condition blocks VO2 backfill inserts.

## 5. Active link scope duplicate preflight

Query equivalent to VO2.1 partial unique scope:

`ACTIVE_LINK_SCOPE_DUPLICATE_GROUP_COUNT=0` (**expected**)

**Index note:** `uq_data_source_link_active` is **not** present on Production. Live indexes include `vehicle_data_source_links_vehicle_id_source_type_source_sub_key` and `uq_vdsl_active_dimo_vehicle`. VO2.1 uses `DROP INDEX IF EXISTS uq_data_source_link_active` then creates `uq_vehicle_data_source_link_active_scope` on `(vehicle_id, source_type, COALESCE(source_subtype,'')) WHERE is_active`.

`CURRENT_UQ_DATA_SOURCE_LINK_ACTIVE_PRESENT=NO`

## 6. Target object collisions

| Object | Present before deploy |
|--------|------------------------|
| VO2 tables (5) | **None** |
| `TARGET_TABLE_COLLISION_COUNT` | **0** |
| VO2 enum types (7) | **None** |
| `TARGET_ENUM_COLLISION_COUNT` | **0** |

## 7. Migration impact

| Table | Rows (exact / estimate) |
|-------|-------------------------|
| `vehicles` | **9** |
| `vehicle_data_source_links` | **7** |
| `organizations` | **4** |

`MIGRATION_IMPACT_CLASS=LOW` — small fleet; VO2 DDL + two backfill INSERTs over 9 vehicles; VO2.1 index swap on 7 links.

## 8. Post–code-deploy runtime (env unchanged)

| Gate | Expected | Evidence |
|------|----------|----------|
| `S4_REMAINS_DORMANT_AFTER_CODE_DEPLOY` | **YES** | No S4B–E in `app.module.ts`; no truthy `DI_V0_S4_*` in `backend.env` |
| `DIMO_GLOBAL_BUDGET_EXPLICIT_ENABLEMENT_AFTER_CODE_DEPLOY` | **NO** | `DIMO_GLOBAL_BUDGET_ENABLED` key absent (config-only rollout still separate) |
| `VEHICLE_ONBOARDING_UNINTENDED_AUTO_ACTIVATION` | **NO** | Module registers API/services only; no deploy-time cutover worker; tables empty until migration |
| `BATTERY_UNINTENDED_AUTO_ACTIVATION` | **NO** | Deploy does not rewrite `backend.env`; existing `BATTERY_V2_*` lines unchanged by code-only promote |

## 9. Canonical deploy authority (target SHA, not executed)

From `backend/scripts/ops/vps-deploy-release.sh` @ `8fa531b27…`:

| Requirement | Present |
|-------------|---------|
| `SYNQDRIVE_REQUESTED_DEPLOY_SHA` exact clone | **YES** (`vps_clone_release_at_sha`) |
| Pre-deploy DB backup | **YES** (`pg_dump` → `shared/backups`) |
| `prisma generate` + `npm run prisma:migrate:deploy` | **YES** |
| Backend + frontend build | **YES** |
| Rolling multi-replica + post-deploy verification | **YES** (`vps_replica_rolling_deploy`, `vps_replica_verify_post_deploy`) |

## 10. Decision

**`DEPLOY_READINESS=PASS`**

Production can receive SHA `8fa531b275bc4dca02c09b279c0d2b806e544007` through `vps-deploy-release.sh` with no discovered schema/data blockers for VO2 migrations.

**`NEXT_ACTION`:** Operator-authorized deploy with `SYNQDRIVE_REQUESTED_DEPLOY_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007`; post-deploy re-run S4F-5 gauge preflight; DIMO global-budget config rollout remains separate (S4F-4).

## Frozen result block

```
EXP021_S4F5_1_RELEASE_DELTA_PREFLIGHT_RESULT=
CURRENT_MAIN_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
TARGET_DEPLOY_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
PRODUCTION_SHA=1dd4224037a84417c5d605575bb6d288ac93184e
PRODUCTION_RELEASE_ID=20260929224455_v4994
REPLICA_A_SHA=1dd4224037a84417c5d605575bb6d288ac93184e
REPLICA_B_SHA=1dd4224037a84417c5d605575bb6d288ac93184e
REPLICA_SHA_MATCH=YES
REPLICA_HEALTH=OK
PROD_TO_TARGET_COMMIT_COUNT=29
PROD_TO_TARGET_CHANGED_FILE_COUNT=330
NEW_PRISMA_MIGRATION_COUNT=2
NEW_PRISMA_MIGRATIONS=backend/prisma/migrations/20260930130000_vehicle_onboarding_vo2_persistence/migration.sql;backend/prisma/migrations/20260930140000_vehicle_onboarding_vo2_1_integrity/migration.sql
VO2_PERSISTENCE_MIGRATION_STATE=NOT_APPLIED
VO2_1_INTEGRITY_MIGRATION_STATE=NOT_APPLIED
FAILED_OR_PARTIAL_MIGRATION_STATE_PRESENT=NO
PRODUCTION_VEHICLE_COUNT=9
PRODUCTION_VEHICLE_WITH_NULL_ORG_COUNT=0
PRODUCTION_DIMO_SYNTHETIC_VIN_COUNT=1
PRODUCTION_NONEMPTY_LICENSE_PLATE_COUNT=9
PRODUCTION_NULL_VIN_COUNT=0
ORPHAN_VEHICLE_ORGANIZATION_COUNT=0
EXPECTED_INITIAL_ORG_ASSIGNMENT_ROWS=9
EXPECTED_INITIAL_PLATE_ASSIGNMENT_ROWS=9
ACTIVE_LINK_SCOPE_DUPLICATE_GROUP_COUNT=0
CURRENT_UQ_DATA_SOURCE_LINK_ACTIVE_PRESENT=NO
TARGET_TABLE_COLLISION_COUNT=0
TARGET_ENUM_COLLISION_COUNT=0
VEHICLES_TABLE_SIZE=9
VEHICLE_DATA_SOURCE_LINKS_TABLE_SIZE=7
MIGRATION_IMPACT_CLASS=LOW
S4_REMAINS_DORMANT_AFTER_CODE_DEPLOY=YES
DIMO_GLOBAL_BUDGET_EXPLICIT_ENABLEMENT_AFTER_CODE_DEPLOY=NO
VEHICLE_ONBOARDING_UNINTENDED_AUTO_ACTIVATION=NO
BATTERY_UNINTENDED_AUTO_ACTIVATION=NO
CANONICAL_DEPLOY_SCRIPT_PRESENT=YES
EXACT_SHA_DEPLOY_REQUIRED=YES
PRE_DEPLOY_DB_BACKUP_PRESENT=YES
PRISMA_MIGRATE_DEPLOY_USED=YES
ROLLING_HEALTH_VERIFICATION_PRESENT=YES
PRODUCTION_ENV_MUTATED=NO
PRODUCTION_RESTART_OCCURRED=NO
DEPLOY_OCCURRED=NO
MIGRATION_EXECUTED=NO
PROVIDER_PRODUCTION_CALL_COUNT=0
S4_RUNTIME_ACTIVE=NO
SHADOW_ACTIVATION_OCCURRED=NO
DEPLOY_READINESS=PASS
BLOCKERS=
NEXT_ACTION=Authorized vps-deploy-release.sh with SYNQDRIVE_REQUESTED_DEPLOY_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007; then S4F-5 runtime preflight and separate S4F-4 config rollout if desired.
```
