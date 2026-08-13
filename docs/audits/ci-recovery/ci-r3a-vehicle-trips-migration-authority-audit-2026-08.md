# CI Recovery R3A — Vehicle Trip migration history authority audit

> **Documentation-only authority audit.** No migration, schema, runtime, test, workflow,
> dependency, or production artifact was changed. Disposable local PostgreSQL 16 was used for
> read/write diagnostics only and then destroyed. This audit determines the safe, evidence-backed
> repair strategy for CI-R3B; it does **not** implement it.
>
> This document incorporates the **CI-R3A.1 independent-review corrections** (see §14). All
> earlier statements have been corrected in place for internal consistency; §14 records exactly
> what changed and why.

## 1. Authoritative base and branch

- Authoritative base: `main @ 5015a17d250f0c2823580a1ff567f580dcac51aa` (CI-R2 merged).
- Audit branch: `fix/ci-r3a-vehicle-trips-migration-authority-audit-2026-08`.
- `PRE_CI_R3A_SHA` = `5015a17d250f0c2823580a1ff567f580dcac51aa`.
- Total committed migrations on base: **283** (+ `migration_lock.toml`).

## 2. Reproduced failure (independent)

Disposable PostgreSQL 16 (native cluster, user `synqdrive`, trust auth, `127.0.0.1:5432`),
fresh empty database `synqdrive_ci_r3a_empty`, then `npx prisma migrate deploy`:

```
Applying migration `20260311224040_init`
Applying migration `20260312120232_add_dimo_vehicle_snapshot_fields`
Applying migration `20260315000000_add_rental_driving_analysis`
Applying migration `20260325161142_trip_architecture_refactor`
Error: P3018
Migration name: 20260325161142_trip_architecture_refactor
Database error code: 42P01
ERROR: relation "vehicle_trips" does not exist   (routine RangeVarGetRelidExtended)
```

| Field | Value |
|-------|-------|
| `FRESH_DB_MIGRATION_REPLAY` | FAIL |
| `PRISMA_ERROR_CODE` | P3018 |
| `POSTGRES_SQLSTATE` | 42P01 |
| `FIRST_FAILING_MIGRATION` | `20260325161142_trip_architecture_refactor` |
| `FIRST_MISSING_RELATION` | `vehicle_trips` |
| Failing SQL statement | line 5: `ALTER TABLE "vehicle_trips" ADD COLUMN "trip_status" …` (unguarded) |
| `SUCCESSFULLY_APPLIED_MIGRATION_COUNT_BEFORE_FAILURE` | 3 (`init`, `add_dimo_vehicle_snapshot_fields`, `add_rental_driving_analysis`) |

### 2a. Corrected replay-failure cascade (multiple defects, not one)

`vehicle_trips` is only the **first** of several missing-base and casing failures. Repairing one
defect at a time (hypothetically) exposes the next, in this chronological order:

| Order | Migration | Statement that fails | Missing/defective object |
|-------|-----------|----------------------|--------------------------|
| 1 | `20260325161142_trip_architecture_refactor` | `ALTER TABLE "vehicle_trips"` (line 5, unguarded) | `vehicle_trips` (missing base) |
| 2 | `20260331000000_v3_hardware_type` | `ALTER TABLE "driving_events" ADD COLUMN …` (unguarded) | `driving_events` (missing base) |
| 3 | `20260413230000_add_composite_indexes_batch_c` | `CREATE INDEX … ON "trip_behavior_events"` | `trip_behavior_events` (missing base) |
| 4 | `20260425000000_retire_user_assignment_and_speeding_severity` | `UPDATE "VehicleTrip"` / `ALTER "TripDrivingImpact"` | **casing** (camelCase vs lowercase) |
| 5 | `20260609000000_autovacuum_tuning` | `ALTER TABLE "vehicle_trip_tracking_runs"/"trip_repairs"/"vehicle_trip_waypoints" SET (…)` | 3 missing base tables |
| 6 | `20260716250000_driving_impact_provenance` (and later) | `ALTER TABLE "trip_driving_impact"` | `trip_driving_impact` (missing base) |

> Note: `20260331000000` and `20260413230000` are chronologically **before** `20260425000000`,
> so the casing defect is not literally "the second" failure — it is the fourth in the cascade.
> The earlier CI-R3A draft under-counted this.

### 2b. Independently confirmed casing defect

A separate disposable database was seeded with lowercase `vehicle_trips`, lowercase
`trip_driving_impact`, and the `TripAssignment*` enums, then `20260425000000`'s SQL was run
verbatim:

```
psql …/20260425000000_…/migration.sql
ERROR:  relation "VehicleTrip" does not exist
LINE 1: UPDATE "VehicleTrip"
```

Quoted identifiers are case-sensitive in PostgreSQL, so `"VehicleTrip"`/`"TripDrivingImpact"`
(camelCase) can never resolve to the canonical lowercase `vehicle_trips`/`trip_driving_impact`.
This is a genuine, independent defect (order 4 above).

## 3. Complete relevant-migration inventory

Repository-wide search of every `*.sql` migration for `vehicle_trips`, `"VehicleTrip"`,
`vehicle_trip_waypoints`, `"VehicleTripWaypoint"`, `trip_behavior_events`, `"TripBehaviorEvent"`,
`driving_events`, `"DrivingEvent"`, `trip_driving_impact`, `"TripDrivingImpact"`,
`vehicle_trip_detection_states`, `vehicle_trip_tracking_runs`, `trip_repairs`, `"TripRepair"`,
`TripStatus`, `TripSource`, `TripAssignmentStatus`, `TripAssignmentSubjectType`,
`TripBookingLinkSource`, `trip_id`:

- `RELEVANT_MIGRATION_FILE_COUNT` = **27**
- `MATRIXED_RELEVANT_MIGRATION_COUNT` = **27**
- `UNMATRIXED_RELEVANT_MIGRATION_COUNT` = **0**

> Discrepancy with the prior independent estimate of "at least 28": a looser scan on the bare
> substring `trip` also matches `sTRIPe` (billing/Stripe migrations) and `tire_trip_usage_*`
> migrations that touch only `tire_trip_usage_ledger` (its own created table) — none of which
> reference a trip **base** table. Verified: `20260716230000_tire_trip_usage_replay_safety`,
> `20260717120000_driving_decision_audits`, `20260710100000_vehicle_driving_assessment_quality`,
> and `20260716340000_rental_driving_analysis_versioning` contain **no** trip-base identifier.
> `20260311224040_init` is relevant only as the base that **omits** the trip tables; it contains
> no trip identifier and is therefore not part of the 27.

### Chronological authority matrix (all 27)

| # | Migration | Trip statement(s) | Casing | Predecessor present in fresh replay? | Idempotent? | Classification |
|---|-----------|-------------------|--------|--------------------------------------|-------------|----------------|
| 1 | `20260325161142_trip_architecture_refactor` | `CREATE TYPE "TripStatus"`; `ALTER "vehicle_trips"` (unguarded) + guarded ADD/DROP; `CREATE INDEX …trip_status` | lower | NO | partial | MISSING_PREDECESSOR (first P3018) |
| 2 | `20260331000000_v3_hardware_type` | `CREATE TYPE "DrivingEventSource"`; `ALTER "driving_events"` (unguarded); index | lower | NO | no | MISSING_PREDECESSOR (`driving_events`) |
| 3 | `20260410000000_add_enrichment_status_fields` | `ALTER "vehicle_trips" ADD behavior_enrichment_status`; index | lower | NO | no | ORDERING_DEFECT |
| 4 | `20260413230000_add_composite_indexes_batch_c` | `CREATE INDEX CONCURRENTLY IF NOT EXISTS` on `vehicle_trips(vehicle_id,start_time)`, `driving_events(...)`, `trip_behavior_events(trip_id,event_category)` | lower | NO | index-guarded (table not) | MISSING_PREDECESSOR (`trip_behavior_events`) + ORDERING_DEFECT |
| 5 | `20260425000000_retire_user_assignment_and_speeding_severity` | `UPDATE/ALTER "VehicleTrip"`; enum rebuild `TripAssignmentStatus`/`TripAssignmentSubjectType`; `ALTER "TripDrivingImpact" DROP COLUMN` | **camel** | NO | no | CASE_MISMATCH + MISSING_PREDECESSOR |
| 6 | `20260609000000_autovacuum_tuning` | `ALTER "vehicle_trip_tracking_runs"/"trip_repairs"/"vehicle_trip_waypoints" SET (...)` | lower | NO | no | MISSING_PREDECESSOR (×3) |
| 7 | `20260615140000_misuse_cases` | FK `trip_id → "vehicle_trips"("id")` | lower | NO | no | ORDERING_DEFECT |
| 8 | `20260628150000_rpm_webhook_candidate` | references `vehicle_trips`/`trip_id` | lower | NO | no | ORDERING_DEFECT |
| 9 | `20260705140000_trip_analysis_status` | `ALTER "vehicle_trips"` analysis cols | lower | NO | mixed | ORDERING_DEFECT |
| 10 | `20260705200000_trip_analysis_status_guard` | `ADD COLUMN IF NOT EXISTS` analysis cols | lower | NO | **yes** | ORDERING_DEFECT (idempotent) |
| 11 | `20260708044000_trip_booking_link_source` | `CREATE TYPE "TripBookingLinkSource"`; `ALTER "vehicle_trips" ADD booking_link_source`; `UPDATE` | lower | NO | no | ORDERING_DEFECT |
| 12 | `20260716150000_battery_v2_measurement_sessions` | FK `trip_id → "vehicle_trips"("id")` | lower | NO | no | ORDERING_DEFECT |
| 13 | `20260716194500_trip_assessabilities` | `CREATE TABLE trip_assessabilities` (FK to vehicle_trips) | lower | NO | no | ORDERING_DEFECT (own table OK; FK target missing) |
| 14 | `20260716200000_driving_evidence` | `CREATE TABLE driving_evidence` (FK to vehicle_trips) | lower | NO | no | ORDERING_DEFECT |
| 15 | `20260716203000_driving_analysis_runs` | `CREATE TABLE` (FK to vehicle_trips) | lower | NO | no | ORDERING_DEFECT |
| 16 | `20260716210000_driving_intelligence_jobs` | `CREATE TABLE` (FK to vehicle_trips) | lower | NO | no | ORDERING_DEFECT |
| 17 | `20260716210000_tire_trip_usage_ledger` | `CREATE TABLE` (FK to vehicle_trips) | lower | NO | no | ORDERING_DEFECT |
| 18 | `20260716220000_tire_trip_usage_attribution` | `ALTER "vehicle_trips"` add tire-usage cols | lower | NO | no | ORDERING_DEFECT |
| 19 | `20260716240000_driving_event_native_identity` | `ALTER "driving_events"` | lower | NO | no | ORDERING_DEFECT (`driving_events`) |
| 20 | `20260716250000_driving_impact_provenance` | `ALTER "trip_driving_impact"` | lower | NO | no | MISSING_PREDECESSOR (`trip_driving_impact`) |
| 21 | `20260716260000_driving_impact_braking_provenance` | `ALTER "trip_driving_impact"` | lower | NO | no | ORDERING_DEFECT |
| 22 | `20260716270000_driving_impact_load_components` | `ALTER "trip_driving_impact"` | lower | NO | no | ORDERING_DEFECT |
| 23 | `20260716310000_driving_attribution_roles` | references trip / `trip_id` | lower | NO | no | ORDERING_DEFECT |
| 24 | `20260716320000_driver_attributions` | `CREATE TABLE driver_attributions` (FK to vehicle_trips) | lower | NO | no | ORDERING_DEFECT |
| 25 | `20260717180000_trip_driving_impact_authoritative_coverage` | `CREATE TYPE "TripDrivingImpactAnalysisStatus"`; `ALTER "trip_driving_impact"` | lower | NO | no | ORDERING_DEFECT |
| 26 | `20260717190000_dimo_braking_event_intake` | FK to `vehicle_trips`/`driving_events` | lower | NO | no | ORDERING_DEFECT |
| 27 | `20260717200000_braking_event_ledger` | FK to `vehicle_trips` | lower | NO | no | ORDERING_DEFECT |

## 4. Corrected missing base-object inventory

Searched every `.sql` migration for `CREATE TABLE` of each object.

`MISSING_TRIP_BASE_TABLE_COUNT` = **8**; `KNOWN_MISSING_BASE_TABLE_OMISSION_COUNT` = **0**.

| # | Prisma model | Mapped table | `CREATE TABLE` count | First migration reference | Guarded? | Replay-blocking? | Confidence of shape |
|---|-------------|--------------|----------------------|---------------------------|----------|------------------|---------------------|
| 1 | `VehicleTrip` | `vehicle_trips` | 0 | `20260325161142` (unguarded ALTER) | no | **YES** | UNKNOWN (base DDL lost) |
| 2 | `DrivingEvent` | `driving_events` | 0 | `20260331000000` (unguarded ALTER) | no | **YES** | UNKNOWN |
| 3 | `TripBehaviorEvent` | `trip_behavior_events` | 0 | `20260413230000` (`CREATE INDEX`) | index guard only | **YES** | UNKNOWN |
| 4 | `VehicleTripWaypoint` | `vehicle_trip_waypoints` | 0 | `20260609000000` (`ALTER … SET`) | no | **YES** | UNKNOWN (schema: id, trip_id, lat, lng, speed_kmh, heading, recorded_at) |
| 5 | `VehicleTripTrackingRun` | `vehicle_trip_tracking_runs` | 0 | `20260609000000` (`ALTER … SET`) | no | **YES** | UNKNOWN |
| 6 | `TripRepair` | `trip_repairs` | 0 | `20260609000000` (`ALTER … SET`) | no | **YES** | UNKNOWN |
| 7 | `TripDrivingImpact` | `trip_driving_impact` | 0 | `20260425000000` (camel `ALTER`), then `20260716250000` (lower) | no | **YES** | UNKNOWN |
| 8 | `VehicleTripDetectionState` | `vehicle_trip_detection_states` | 0 | **none** (0 migration references) | n/a | **NO** (schema drift only) | UNKNOWN |

Present (not missing): `trip_assessabilities`, `driving_evidence`, `driving_analysis_runs`,
`driving_intelligence_jobs`, `driver_attributions`, `tire_trip_usage_ledger`, `misuse_cases`,
`rpm_webhook_candidates`, `braking_event_ledger`, `dimo_braking_event_intake`,
`battery_measurement_sessions` (each has exactly 1 `CREATE TABLE`). `tire_trip_usage_attribution`
is **not** a table (it is columns added to `vehicle_trips`).

### Missing enums

| Enum | Clean `CREATE TYPE` count | Evidence |
|------|---------------------------|----------|
| `TripSource` | 0 | used by schema (`trip_source @default(V2_LIVE)`); never created in any SQL; `trip_source` column never added by any migration |
| `TripAssignmentStatus` | 0 clean | only `20260425000000` "creates" it via rename-rebuild, which first `ALTER TYPE … RENAME TO …_old` (assumes it pre-exists) |
| `TripAssignmentSubjectType` | 0 clean | same rename-rebuild predecessor assumption |

Created enums (not missing): `TripStatus` (`20260325161142`), `DrivingEventSource`
(`20260331000000`), `TripBookingLinkSource` (`20260708044000`), `TripDrivingImpactAnalysisStatus`
(`20260717180000`).

`TRIP_BEHAVIOR_EVENTS_CREATE_COUNT` = 0; `TRIP_BEHAVIOR_EVENTS_FIRST_REFERENCE` =
`20260413230000_add_composite_indexes_batch_c`. `TRIP_REPAIRS_CREATE_COUNT` = 0;
`TRIP_REPAIRS_FIRST_REFERENCE` = `20260609000000_autovacuum_tuning`.

## 5. Corrected temporal column authority

The refactor `20260325161142`'s **first unguarded** statement (`ALTER TABLE "vehicle_trips" ADD
COLUMN "trip_status" …`) requires only that the **table exists** — it does not require any
specific pre-existing column. All legacy DROPs and the three speeding ADDs are guarded.

| Category | Columns | Classification | Required before `20260325161142`? |
|----------|---------|----------------|-----------------------------------|
| Legacy conditionally dropped | `dimo_mechanism`, `road_surface_type`, `road_surface_score`, `climate_factor`, `tire_wear_contrib_km`, `dtc_codes_found`, `avg_temperature_c` | **LEGACY_POSSIBLE / UNKNOWN_PREEXISTENCE** (guarded `DROP … IF EXISTS` proves only anticipation) | **NO** |
| Guarded speeding adds | `speeding_percent`, `max_over_speed_kmh`, `speeding_segments` | **OPTIONAL_PREEXISTING_GUARDED** (migration creates them when absent) | **NO** |
| Required by `20260413230000` | `vehicle_id`, `start_time` (composite index) | STRONGLY_DERIVED (first requirement at `20260413230000`) | NO |
| Required by `20260425000000` | `assignment_status`, `assignment_subject_type`, `assignment_subject_id` | STRONGLY_DERIVED (first requirement at `20260425000000`) | NO |
| Required only by later migrations | `id` (FK target first at `20260615140000`; structurally the PK at creation), `booking_link_source` (`20260708044000`), analysis_* (`20260705*`), etc. | STRONGLY_DERIVED / added-later | NO |
| Creation point unknown | ~85 other current-schema columns | **UNKNOWN** | UNKNOWN |

- Required strictly **before** `20260325161142`: **only table existence with a primary key** — no
  specific data column is provably required at that instant.
- `FALSE_PROVEN_BASE_COLUMN_COUNT` = **0** (all previously "proven mandatory base" columns are
  reclassified to LEGACY_POSSIBLE / OPTIONAL_PREEXISTING_GUARDED / STRONGLY_DERIVED-by-later /
  UNKNOWN).
- `GUESSED_BASE_COLUMN_COUNT` = **0** (every column carries explicit evidence or is UNKNOWN).

## 6. Corrected out-of-band-origin statement

Repository evidence proves only that (a) the trip Prisma models existed since the initial commit
`77c26dad` and (b) the committed migration history never creates the corresponding tables.
Therefore an **external / non-versioned baseline must have existed** for the environments where
these tables are present.

- `OUT_OF_BAND_BASELINE_EXISTENCE` = **PROVEN**.
- `OUT_OF_BAND_BASELINE_CREATION_METHOD` = **UNKNOWN** — could be `prisma db push`, manual SQL, an
  untracked migration, a database dump/restore, or another external provisioning process. The
  exact mechanism is **not** determinable from the repository and is **not** asserted as fact.

## 7. Pre-refactor field-level contract

See §5. The minimal provable pre-refactor contract is: table `vehicle_trips` exists with a
primary key. Every data-column's pre-refactor existence is either STRONGLY_DERIVED from a later
migration's first reference or UNKNOWN (original base DDL absent — §8). No column is guessed.

## 8. Git-history evidence

```
git log --all -S'CREATE TABLE "vehicle_trips"' -- backend/prisma      → (none)
git log --all -S'CREATE TABLE "VehicleTrip"'   -- backend/prisma      → (none)
git log --all -S'model VehicleTrip'   -- backend/prisma/schema.prisma → 77c26dad (initial commit)
git log --all -S'@@map("vehicle_trips")' -- …/schema.prisma           → 77c26dad (initial commit)
```

- The `VehicleTrip` model **and** its `@@map("vehicle_trips")` exist from the first commit
  `77c26dad`; `20260325161142` is also present there, already altering a table nothing creates.
- No `CREATE TABLE` for any of the 8 missing base tables exists in **any** ref.
- `AUTHORITATIVE_ORIGINAL_BASE_DDL_FOUND` = **NO**.

## 9. Existing-database compatibility analysis (no production access)

CI-R3B must satisfy **both**: **A.** an empty database replaying all 283 migrations, and **B.** an
existing database where the trip tables exist and later migrations are already recorded in
`_prisma_migrations`. Constraints: editing an already-applied migration risks a checksum/history
conflict on B (unsafe by default); a retroactive insert must be fully idempotent to be a no-op on
B; the casing defect fails on A regardless of the base bootstrap and cannot be neutralized by the
base bootstrap alone.

## 10. Repair-option decision matrix

| Opt | Strategy | Empty-DB (A) | Existing-DB (B) | Checksum | Data-loss | Repairs history? | Only hides? | Verdict |
|-----|----------|-------------|-----------------|----------|-----------|------------------|-------------|---------|
| A | Edit `20260311224040_init` | fixes base | edits applied migration | breaks | none | partial | no | REJECTED_UNSAFE |
| B | Edit `20260325161142` | fixes base | edits applied migration | breaks | none | partial | partly | REJECTED_UNSAFE |
| C | Restore authoritative missing migration | would fix | new file | none | none | yes | no | INSUFFICIENT_AUTHORITY (no such file exists) |
| **D** | New retroactive, fully-idempotent bootstrap before the refactor (creates all 8 tables + 3 enums, `IF NOT EXISTS`) | creates missing base | no-op on B | none | none | yes | no | **SAFE_CANDIDATE (base-gap only)** |
| E | End-of-history migration | too late | n/a | none | none | no | no | REJECTED_UNSAFE (wrong order) |
| F | Squash/replace history | fixes A | forces baseline reset | high | high | resets | partly | REJECTED_UNSAFE |
| G | CI-only bootstrap SQL | greens CI | n/a | none | none | no | yes | REJECTED_UNSAFE (hides defect) |
| H | `prisma db push` | drift | drift | n/a | possible | no | yes | REJECTED_UNSAFE |
| I | `migrate resolve --applied` | leaves table absent on A | n/a | n/a | correctness risk | no | yes | REJECTED_UNSAFE |
| **J** | **Guarded retroactive pre/post casing-compat migrations** (rename lowercase → camelCase before `20260425000000`, back after) | can pass | **runtime-visible wrong-casing window + guard must gate on prod applied-state** | none (new files) | none if guarded | works around, does not repair | partly | **INSUFFICIENT_AUTHORITY** |

### Option J detailed analysis (casing repair without editing the applied migration)

- **Does Prisma apply new migrations interleaved around an applied one?** Yes — `migrate deploy`
  applies every pending migration in lexicographic order regardless of interleaving; a
  pre-`20260425000000` new file (M1) and a post file (M2) both run on B (M1 out-of-order, which
  `deploy` permits though `migrate dev` would flag).
- **Existing-DB (B) hazard:** on B the canonical tables are lowercase and `20260425000000` is
  already recorded (so it will **not** re-run). A naive guard "rename to camelCase if lowercase
  exists and camelCase absent" is **true** on B → M1 would rename the **live** table to
  `"VehicleTrip"`; M2 renames it back. Because M1 and M2 are **separate migrations = separate
  transactions**, there is a **runtime-visible window** where the live table has the wrong name
  → runtime availability risk. Avoiding this requires the guard to detect that `20260425000000`
  is already applied (i.e. read `_prisma_migrations`), which is fragile and depends on prod state.
- **PostgreSQL mechanics:** `ALTER TABLE … RENAME` preserves FKs, indexes, sequences and OIDs;
  the enum rename/rebuild inside `20260425000000` is independent of table names — so the rename
  mechanics themselves are safe.
- **Testability:** the fresh-DB path is fully testable; the existing-DB safety hinges on prod
  `_prisma_migrations` applied-state and live casing, which are unknown → cannot be proven safe
  without production authority.
- **Verdict:** `INSUFFICIENT_AUTHORITY`. It is, however, a genuine **in-repository, append-only
  alternative** to editing the applied migration — so the earlier claim that editing
  `20260425000000` is "the only in-repository remedy" is **withdrawn**.

`UNASSESSED_CASING_REPAIR_STRATEGY_COUNT` = **0** (evaluated: B edit; J pre/post rename; and the
"pre-create enums in final form" idea, which still fails because `20260425000000` references
camelCase tables and re-runs the rename-rebuild).

## 11. Provisional CI-R3B contract (specification only — not implementation-ready)

- **Base-gap bootstrap (Option D)** — proposed new
  `backend/prisma/migrations/20260325161141_trip_bootstrap/migration.sql`, fully idempotent:
  - Tables (`CREATE TABLE IF NOT EXISTS`): `vehicle_trips`, `driving_events`,
    `trip_behavior_events`, `vehicle_trip_waypoints`, `vehicle_trip_tracking_runs`, `trip_repairs`,
    `trip_driving_impact`, `vehicle_trip_detection_states`.
  - Enums (guarded `CREATE TYPE`): `TripSource`, `TripAssignmentStatus`, `TripAssignmentSubjectType`.
  - `PROVISIONAL_BOOTSTRAP_OBJECT_COUNT` = **11** (8 tables + 3 enums);
    `PROVISIONAL_BOOTSTRAP_OMITTED_OBJECT_COUNT` = **0**.
  - Authority: proven/derived columns from migration references; the remainder of each table's
    shape requires the **current Prisma schema as canonical authority behind `IF NOT EXISTS`
    guards** — flagged as an unknown requiring reviewer authorization (§12), **not** silently
    promoted to historical authority.
- **Casing repair** — treated **separately** from the base bootstrap; status
  `INSUFFICIENT_AUTHORITY` (Options B and J both require prod authority).
- `BASE_GAP_STRATEGY_STATUS` = **SAFE_CANDIDATE**.
- `CASING_STRATEGY_STATUS` = **INSUFFICIENT_AUTHORITY**.
- `END_TO_END_R3B_STRATEGY_STATUS` = **BLOCKED** (no single safe end-to-end strategy for both A
  and B until §12 authority is obtained).

### Recommendation counters (audit findings, not authorization)

| Counter | Value |
|---------|-------|
| `HISTORICAL_APPLIED_MIGRATION_EDIT_REQUIRED` | UNKNOWN — avoidable via Option J only if prod authority proves it safe; otherwise required for casing |
| `RETROACTIVE_MIGRATION_REQUIRED` | YES — Option D bootstrap (+ possibly J for casing) |
| `CURRENT_SCHEMA_CHANGE_REQUIRED` | NO |
| `RUNTIME_CHANGE_REQUIRED` | NO |
| `TEST_LOGIC_CHANGE_REQUIRED` | NO |
| `WORKFLOW_CHANGE_REQUIRED` | NO |
| `PRODUCTION_DATA_REPAIR_REQUIRED` | NO |
| `PRODUCTION_DEPLOYMENT_REQUIRED` | NO (within CI-R3B) |

## 12. Critical unknowns (`IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` = 12)

1. Exact historical `vehicle_trips` column shape.
2. Exact historical `driving_events` column shape.
3. Exact historical `trip_behavior_events` column shape.
4. Exact historical `vehicle_trip_waypoints` column shape.
5. Exact historical `vehicle_trip_detection_states` column shape.
6. Exact historical `vehicle_trip_tracking_runs` column shape.
7. Exact historical `trip_repairs` column shape.
8. Exact historical `trip_driving_impact` column shape.
9. Missing enum origins (`TripSource`, `TripAssignmentStatus`, `TripAssignmentSubjectType`).
10. Actual existing-database table casing (lowercase vs camelCase on prod/staging).
11. Existing `_prisma_migrations` applied-state and checksums (esp. for `20260425000000`).
12. A proven-safe casing-repair mechanism (Option B vs J) given (10) and (11).

`GUESSED_BASE_COLUMN_COUNT` = 0. `STALE_CRITICAL_UNKNOWN_COUNT` = **0** (the prior count of 6 is
superseded; the eight table contracts are counted distinctly rather than collapsed).

## 13. Scope counters

| Counter | Value |
|---------|-------|
| `CHANGED_FILE_COUNT` / `CORRECTION_CHANGED_FILE_COUNT` | 1 |
| `HISTORICAL_MIGRATION_EDIT_COUNT` | 0 |
| `NEW_MIGRATION_COUNT` | 0 |
| `SCHEMA_CHANGE_COUNT` | 0 |
| `RUNTIME_CHANGE_COUNT` | 0 |
| `TEST_LOGIC_CHANGE_COUNT` | 0 |
| `WORKFLOW_CHANGE_COUNT` | 0 |
| `DEPENDENCY_CHANGE_COUNT` | 0 |
| `LOCKFILE_CHANGE_COUNT` | 0 |
| `PRODUCTION_CONFIG_CHANGE_COUNT` | 0 |
| `PRODUCTION_DATABASE_ACCESS_COUNT` | 0 |
| `PRODUCTION_DEPLOYMENT_COUNT` | 0 |
| `CI_R3B_IMPLEMENTATION_COUNT` | 0 |
| `E6_CHANGE_COUNT` / `E7`/`E8`/`E9_RUNTIME_SCOPE_COUNT` | 0 |
| `OUT_OF_SCOPE_FILE_COUNT` | 0 |

Diagnostics used a disposable local PostgreSQL 16 cluster (destroyed after use). No
remote/production `DATABASE_URL` was ever used.

## 14. CI-R3A.1 — Independent Review Corrections

Independent review of the initial CI-R3A report found four mandatory correction categories; all
are now integrated above and summarized here:

1. **Two omitted missing base tables added** — `trip_behavior_events` (0 `CREATE`; first
   referenced by `20260413230000` `CREATE INDEX`) and `trip_repairs` (0 `CREATE`; first
   referenced by `20260609000000` `ALTER … SET`). `MISSING_TRIP_BASE_TABLE_COUNT` corrected from
   6 to **8** (§4). The provisional bootstrap now includes both (§11).
2. **Complete relevant-migration inventory** — repository-wide scan yields
   `RELEVANT_MIGRATION_FILE_COUNT` = **27**, all matrixed (§3), including the previously omitted
   `20260331000000`, `20260609000000`, `20260628150000`, `20260705200000`, `20260716194500`,
   `20260716200000`, `20260716203000`, `20260716210000` (×2), `20260716220000`, `20260716240000`,
   `20260716250000`, `20260716260000`, `20260716270000`, `20260716310000`, `20260716320000`,
   `20260717190000`, `20260717200000`. `UNMATRIXED_RELEVANT_MIGRATION_COUNT` = 0. The corrected
   cascade (§2a) shows `driving_events` (`20260331000000`) and `trip_behavior_events`
   (`20260413230000`) fail **before** the casing defect at `20260425000000`.
3. **Temporal column authority corrected** — legacy conditionally-dropped columns reclassified as
   LEGACY_POSSIBLE / UNKNOWN_PREEXISTENCE; guarded speeding columns as
   OPTIONAL_PREEXISTING_GUARDED; `vehicle_id`/`start_time`/`assignment_*`/`id` bucketed by their
   first committed requirement. No column is required strictly before the refactor except table
   existence. `FALSE_PROVEN_BASE_COLUMN_COUNT` = 0; `GUESSED_BASE_COLUMN_COUNT` = 0 (§5).
4. **Out-of-band origin corrected** — `OUT_OF_BAND_BASELINE_EXISTENCE = PROVEN`,
   `OUT_OF_BAND_BASELINE_CREATION_METHOD = UNKNOWN`; `prisma db push` is no longer stated as fact
   (§6).

Additional: the repair matrix now evaluates **Option J** (guarded retroactive pre/post casing
migrations) and withdraws the claim that editing `20260425000000` is the only in-repository
remedy; `UNASSESSED_CASING_REPAIR_STRATEGY_COUNT` = 0 (§10). Critical unknowns recalculated to
**12** (§12). No implementation, migration, schema, production access, or deployment occurred.

## 15. Final audit status

The audit correction is complete: every relevant migration is matrixed, all 8 missing trip base
tables and 3 missing enums are recorded with zero omissions, false-proven column classifications
are removed, the out-of-band origin is stated accurately, and casing alternatives (including the
append-only Option J) are evaluated. Option **D** is a SAFE_CANDIDATE for the base-gap; the casing
repair remains INSUFFICIENT_AUTHORITY; and a single safe end-to-end CI-R3B strategy cannot be
finalized because the twelve authority items in §12 (exact historical table shapes, enum origins,
live table casing, `_prisma_migrations` state/checksums, and a proven casing-repair mechanism)
remain unresolved.

**Status: CI_R3A_AUTHORITY_BLOCKED** — audit complete and corrected; CI-R3B implementation
requires the §12 authority before a single safe strategy can be committed.
