# M3.3G G4 — Production enablement preflight (read-only)

**Date:** 2026-09-29  
**Mode:** Preflight audit only — **no deploy**, **no production DB writes**, **no migration apply**

| Field | Value |
|-------|-------|
| `REPO_MAIN_SHA` | **`1dd4224037a84417c5d605575bb6d288ac93184e`** |
| `PRODUCTION_SHA` | **`6952fdf727f236ac7b338e14b85d54af6733fa0f`** (release `20260928175908_v4994`) |
| `PRODUCTION_BEHIND_MAIN` | **YES** — **43 commits**, **213 files** |

## Documentation semantics (G3 / G3.1 / G3.1.1)

On **`origin/main`**, G3 engineering is:

| Label | Applies |
|-------|---------|
| **MERGED** | PR **#1842** @ `1dd422403` |
| **CI_VALIDATED** | Battery longitudinal Postgres CI, F5 unit/historical postgres, module registry (main push) |
| **NOT_YET_PRODUCTION_DEPLOYED** | Superseded for **`1dd422403`** — see **`M3_3G_G4_PRODUCTION_DEPLOY_VERIFICATION_2026-09-29.md`** |

Do **not** call G3 **PRODUCTION_VALIDATED** until post-deploy verification confirms schema + intended runtime on production.

---

## 1. Production → main delta (not Battery-only)

### Commit inventory (43)

Includes, in merge order (newest first): **#1842** Battery G3 F5↔GT; **#1841** DI S4D replay; **#1840** Battery G2/G2.1/G2.2; **#1837** Battery G1; **#1835** F5.1 CLI; **#1834** F5.0 docs; hybrid RFRF / EED-OQ-019; **#1839** S4C; S4B dormant orchestration; **#1836** G0 audit; **#1832** hybrid trust; **#1831** F4.6 evidence; and CI/test/doc commits in the same range.

### File counts

| Metric | Value |
|--------|------:|
| `DELTA_COMMIT_COUNT` | **43** |
| `DELTA_FILE_COUNT` | **213** |
| `BATTERY_DELTA_FILE_COUNT` | **71** (battery-v2 authority, G1–G3 code, F5/GT scripts/tests, GT migrations) |
| `NON_BATTERY_DELTA_FILE_COUNT` | **142** |
| `DRIVING_INTELLIGENCE_DELTA_FILE_COUNT` | **66** (S4B/S4C/S4D + tests; overlaps non-battery) |

**Conclusion:** Deploying **`main`** is a **multi-module** release (Battery GT + DI EXP-021 tranche + RFRF hybrid trust + EED graph + SynqDrive Code), not a Battery-only delta.

---

## 2. Migration audit (6952fdf → 1dd422403)

Only **two** new Prisma migration folders appear in this git range (production has not applied them):

### `20260929120000_battery_ground_truth_events` (BATTERY_G1)

| Field | Value |
|-------|-------|
| `MODULE` | Battery V2 M3.3G G1 |
| `DDL_TYPE` | CREATE enums + CREATE tables + indexes + FKs + partial uniques |
| `TABLE_CREATED` | **`battery_ground_truth_events`**, **`battery_ground_truth_revocations`** |
| `COLUMN_ADDED` | N/A (new tables) |
| `COLUMN_CHANGED` | **`vehicle_service_events.organization_id`** backfill via `UPDATE … SET organization_id = v.organization_id` where NULL |
| `INDEX_CREATED` | Org/vehicle/type/scope/fingerprint/supersedes indexes; partial uniques on active fingerprint + confirmed successor |
| `UNIQUE_CONSTRAINT` | `battery_ground_truth_events_active_fingerprint_key`; `battery_ground_truth_one_confirmed_successor_per_prior` |
| `BACKFILL` | **Service-event org only** — explicit comment: *no GT backfill* |
| `LOCK_RISK` | **LOW–MEDIUM** — table creates cheap; org `UPDATE` touches rows with NULL `organization_id` only |
| `EXISTING_ROW_REWRITE_RISK` | **YES (bounded)** — nullable `vehicle_service_events.organization_id` rows only |
| `ROLLBACK_CHARACTERISTICS` | Drop GT tables/enums if empty after deploy; org backfill not automatically reversed |

### `20260929140000_battery_ground_truth_replacement_source_scope_unique` (BATTERY_G2_2)

| Field | Value |
|-------|-------|
| `MODULE` | Battery V2 M3.3G G2.2 |
| `DDL_TYPE` | CREATE partial unique index only |
| `TABLE_CREATED` | none |
| `INDEX_CREATED` | **`battery_ground_truth_one_active_replacement_per_source_event`** on `(organization_id, source_service_event_id)` WHERE CONFIRMED + BATTERY_REPLACEMENT |
| `BACKFILL` | **NO** |
| `LOCK_RISK` | **LOW** (empty GT table at first apply) |
| `EXISTING_ROW_REWRITE_RISK` | **NO** |
| `ROLLBACK_CHARACTERISTICS` | `DROP INDEX` |

### Summary

| Field | Value |
|-------|-------|
| `GT_MIGRATION_COUNT` | **2** |
| `GT_MIGRATIONS` | `20260929120000_battery_ground_truth_events`, `20260929140000_battery_ground_truth_replacement_source_scope_unique` |
| `GT_MIGRATIONS_ADDITIVE_ONLY` | **YES** for GT tables (greenfield). **NO** for whole migration set — G1 includes bounded **`vehicle_service_events`** org backfill |
| `DESTRUCTIVE_MIGRATION_PRESENT` | **NO** (no DROP COLUMN / table replace) |
| `EXISTING_ROW_REWRITE_REQUIRED` | **YES** — G1 org backfill only; **not** GT synthesis |

---

## 3. G1–G3 runtime activation after deploy

| Layer | After deploy (code + migrations, **env unchanged**) |
|-------|------------------------------------------------------|
| **A. Schema availability** | **`battery_ground_truth_*`** exists after migrate |
| **B. Runtime code present** | `BatteryGroundTruthService`, `BatteryGroundTruthEmissionService`, G2 admission, G3 F5 report CLI |
| **C. Runtime automatically invoked** | **NO** batch/cron GT writer |
| **D. Feature-flag gated** | **NO** dedicated `BATTERY_GROUND_TRUTH_ENABLED` — emission is **event-driven** |
| **E. Operator / manual only** | **YES** for new GT rows (see call sites) |

### `BatteryGroundTruthEmissionService` production call sites

| Path | Trigger |
|------|---------|
| `backend/src/modules/vehicle-intelligence/battery-health/battery-health.service.ts` | `applyFromDocumentExtraction` → `convergeDocumentApplyGroundTruth` after confirmed battery document apply (including idempotent retry when evidence already exists) |
| `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` | `POST …/battery/ground-truth/confirm-replacement` → `confirmManualBatteryReplacement` |

No scheduler, worker, startup hook, or reconciliation job references GT emission (repository grep).

### Automatic GT on deploy?

| Question | Answer |
|----------|--------|
| `CONFIRMED_DOCUMENT_GT_AUTOMATICALLY_ACTIVE` | **Mechanism live** after deploy, but fires only on **human-confirmed document battery apply** HTTP flows — **not** on deploy/startup |
| `MANUAL_CONFIRMATION_GT_AUTOMATICALLY_ACTIVE` | **Mechanism live** on explicit **POST confirm-replacement** only |
| Normal background traffic writes GT immediately? | **NO** |

---

## 4. Backfill / historical synthesis

| Field | Value |
|-------|-------|
| `AUTOMATIC_GT_BACKFILL` | **NO** |
| `HISTORICAL_GT_SYNTHESIS` | **NO** |
| `STARTUP_GT_MUTATION` | **NO** |

Evidence: migrations state no GT backfill; no emission in workers/schedulers; emission services only called from document apply + manual endpoint.

---

## 5. D3 / F5 / E3 / F6 non-regression (env-preserving deploy)

Production **`backend.env`** today (observed names/values):

| Flag | Observed |
|------|----------|
| `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **`true`** (D3 sustained ON) |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | **`true`** |
| `DI_V0_S4_*` | **Absent** → control plane **all OFF** (`parseDiV0S4BooleanFlag` default) |

VPS deploy links **`/opt/synqdrive/shared/backend.env`** — **code SHA changes; env file not replaced by standard release script** unless separately mutated.

| Field | Value |
|-------|-------|
| `D3_FLAG_BEFORE` | **`BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true`** |
| `D3_FLAG_AFTER_EXPECTED` | **Unchanged** (same env) |
| `D3_RUNTIME_BEHAVIOR_CHANGE` | **NO** (same flags + same D3 code path family; main adds GT/F5 read layers, not D3 materialization policy change in this delta’s Battery scope) |
| `F5_COLLECTION_CHANGE` | **Additive CLI/report (G3 V2)** — does not alter D3 writers; production ops gain scripts after deploy |
| `E3_BEFORE` | **OFF** (no E3 runtime flag; evaluator only in F5 read-only report) |
| `E3_AFTER_EXPECTED` | **OFF** |
| `F6_ACTIVATED` | **NO** |

---

## 6. Driving Intelligence / S4D delta (would ship with main)

Production **already** includes S4B-era code @ `6952fdf`; **main adds S4C/S4D** packages (#1839, #1841) not yet on production SHA.

| Field | Value |
|-------|-------|
| `S4D_RUNTIME_CHANGE` | **YES (code on disk)** — pinned replay executor path in S4C |
| `S4D_SCHEMA_CHANGE` | **NO** new migrations in 6952fdf..main range for S4D (S4A/S4B migrations already on prod from earlier releases) |
| `S4D_MIGRATION` | **None in this delta** |
| `S4D_FEATURE_FLAG_CHANGE` | **NO** — still **`DI_V0_S4_*` unset = OFF** |
| `S4D_AUTOMATIC_ACTIVATION` | **NO** — `DiV0S4bOrchestrationModule` **not** registered in `AppModule` (dormant audit); discovery/worker require master + allowlists + kill-row NOT_KILLED |
| `S4D_DEPLOYMENT_RISK` | **LOW for automatic customer/runtime activation**; **MEDIUM for release complexity** (large DI diff, future flag mistake) |

**Not a STOP blocker** for unintended S4D live activation **if env remains unchanged**.

---

## 7. Deployment safety classification

| Gate | Status |
|------|--------|
| CI green on main | **PARTIAL** — Battery longitudinal + S4A postgres **success**; **Trip FSM — Production Readiness CI** was **in_progress** on main push @ audit time |
| Migrations understood | **YES** |
| No destructive migration | **YES** |
| No unintended GT backfill | **YES** |
| No unintended E3/F6 | **YES** |
| No unintended S4D activation (env unchanged) | **YES** |
| D3 behavior preserved (env unchanged) | **YES** |
| Rollback strategy | **YES** — `backend/scripts/ops/vps-rollback-production-release.sh` + deploy state capture |

```
DEPLOYMENT_READINESS=READY_WITH_EXPLICIT_GATES
```

### `DEPLOYMENT_BLOCKERS` (process, not GT-science)

1. **Multi-module release** — not Battery-only; requires explicit release notes / owner sign-off for DI + RFRF slices bundled with G1–G3.
2. **CI** — confirm **Trip FSM** (and any org-required checks) **green** on `1dd422403` before deploy authorization.
3. **Migration apply window** — G1 org backfill `UPDATE` on `vehicle_service_events` (bounded, but not zero-touch).
4. **Explicit env gate** — deploy must **not** toggle `DI_V0_S4_*` or E3; preserve D3 flag as today unless separate authorized change.
5. **PR #1843** — documentation preflight; **do not merge** until reviewed alongside this preflight.

---

## 8. Post-deploy verification plan (design only — do not execute here)

1. Production git SHA == target release SHA (`1dd422403` or successor tag).
2. `npx prisma migrate deploy` reported success; `_prisma_migrations` contains both GT migrations.
3. `\d battery_ground_truth_events` exists; revocations table + indexes present.
4. `SELECT COUNT(*) FROM battery_ground_truth_events` → expect **0** immediately post-migrate.
5. Naturality guard: no rows with CI fixture org pattern (`companyName` like `GT %`) unless real org collision.
6. D3 still writing revisions (`BatteryLongitudinalProfileRevision` growth / existing metrics).
7. `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` still **true** if that was pre-deploy intent.
8. E3 runtime still unreachable (no new E3 flag).
9. F6 / numeric calibration still inactive.
10. `GET /api/v1/health` PASS; PM2 replicas healthy.
11. Error-rate / log scan — no GT admission P2002 storm (empty table expected).
12. Optional: `BATTERY_F5_ALLOW_PRODUCTION_READONLY=true` + F5 V2 report → `groundTruth.linkageAvailable=true`, counts **0**.

**G4 readiness semantics:**

| Field | Meaning |
|-------|---------|
| `G4_COLLECTION_INFRASTRUCTURE_READY_AFTER_DEPLOY_EXPECTED` | **YES** (schema + emission paths live) |
| `NATURAL_GT_PRESENT` | Still **NO** until first legitimate post-deploy confirmed event |

---

## Machine-readable summary

```
M3_3G_G4_PRODUCTION_ENABLEMENT_PREFLIGHT=COMPLETE
GT_SCHEMA_CURRENT_PRODUCTION=ABSENT
GT_SCHEMA_AFTER_DEPLOY=AVAILABLE_AFTER_MIGRATE
GROUND_TRUTH_EMISSION_SERVICE_AFTER_DEPLOY=PRESENT_EVENT_DRIVEN_ONLY
PRODUCTION_DEPLOY=NO
PRODUCTION_DB_WRITES=NO
```
